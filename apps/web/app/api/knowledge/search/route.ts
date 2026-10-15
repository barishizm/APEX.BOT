import { getBotForUser, listKnowledgeChunks } from "@apex/db"
import { CONFIDENCE, KnowledgeBase, relevantHits } from "@apex/knowledge"
import { readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { knowledgeErrorResponse, minRetrievalScore } from "@/lib/knowledge"

// "Try a question": which excerpts the assistant would answer from, ranked like the chat API does
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { query } = await readJson(request)
    const text = typeof query === "string" ? query.trim().slice(0, 500) : ""
    if (!text) return Response.json({ error: "invalid_input", message: "Type a question" }, { status: 400 })
    const bot = await getBotForUser(db(), user.id)
    const index = new KnowledgeBase()
    index.load(bot.id, await listKnowledgeChunks(db(), bot.id))
    const ranked = index.search(bot.id, [{ text, weight: 1 }], 4)
    const confidence = bot.settings.persona.confidence
    const used = new Set(relevantHits(ranked, minRetrievalScore(), confidence).map((h) => h.chunk.id))
    return Response.json({
      answered: used.size > 0,
      confidence,
      threshold: Math.round(minRetrievalScore() * CONFIDENCE[confidence] * 100) / 100,
      results: ranked.map((h) => ({ title: h.chunk.title, url: h.chunk.url, text: h.chunk.text, score: Math.round(h.score * 100) / 100, used: used.has(h.chunk.id) })),
    })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
