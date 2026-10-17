import { getBotForUser, listKnowledgeChunks } from "@apex/db"
import { CONFIDENCE, DEFAULT_RETRIEVAL, KnowledgeBase, retrieve } from "@apex/knowledge"
import { errorJson, readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { knowledgeErrorResponse, minRetrievalScore, previewSemantic } from "@/lib/knowledge"
import { siteScope } from "@/lib/current-site"

const round = (x: number | null, places: number) => (x === null ? null : Math.round(x * 10 ** places) / 10 ** places)

// "Try a question": which excerpts the assistant would answer from, ranked the way the chat API does
// (keywords, and meaning once the chat API has embedded the bot's content)
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { query } = await readJson(request)
    const text = typeof query === "string" ? query.trim().slice(0, 500) : ""
    if (!text) return errorJson("invalid_input", "Type a question", { status: 400 })
    const bot = await getBotForUser(db(), await siteScope(user.id))
    const chunks = await listKnowledgeChunks(db(), bot.id)
    const index = new KnowledgeBase()
    const generation = index.load(bot.id, chunks)
    const { semantic, embedded } = await previewSemantic(index, generation, bot.id, chunks, text)
    const confidence = bot.settings.persona.confidence
    const { ranked, hits } = retrieve(index, bot.id, { message: text, semantic }, { ...DEFAULT_RETRIEVAL, topK: 4, minScore: minRetrievalScore(), confidence })
    const used = new Set(hits.map((h) => h.chunk.id))
    return Response.json({
      answered: used.size > 0,
      confidence,
      // the keyword floor, for the "below the threshold" explanation when only keywords are matched
      threshold: Math.round(minRetrievalScore() * CONFIDENCE[confidence] * 100) / 100,
      meaning: { on: semantic !== null, embedded, chunks: chunks.length },
      results: ranked.map((h) => ({
        title: h.chunk.title,
        url: h.chunk.url,
        text: h.chunk.text,
        keywords: round(h.lexical, 2),
        meaning: round(h.semantic, 3),
        used: used.has(h.chunk.id),
      })),
    })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
