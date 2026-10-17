import { addAnswerToKnowledge, dismissUnansweredForUser } from "@apex/db"
import { chunkText } from "@apex/knowledge"
import { errorJson, readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { knowledgeErrorResponse, sourceJson } from "@/lib/knowledge"
import { siteScope } from "@/lib/current-site"

// Each entry (question line + answer lines, no blank line inside) is its own chunk, so retrieval
// finds the answer under the exact question; a long answer is packed like any text.
const chunkAnswers = (title: string, content: string) => content.split(/\n{2,}/).flatMap((entry) => chunkText(title, entry))

// Body: { action: "answer", question, answer, replyIds } or { action: "dismiss", replyIds }
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const locale = await requestLocale()
    const body = await readJson(request)
    if (body.action === "dismiss") {
      return Response.json({ resolved: await dismissUnansweredForUser(db(), await siteScope(user.id), body.replyIds) })
    }
    if (body.action !== "answer") return errorJson("invalid_input", "Choose what to do with the question", { status: 400 })
    const { source, resolved } = await addAnswerToKnowledge(
      db(),
      await siteScope(user.id),
      // the source is named once, in the language of whoever adds the first answer
      { question: body.question, answer: body.answer, replyIds: body.replyIds, title: getAppDictionary(locale).analytics.answersSource },
      chunkAnswers,
    )
    return Response.json({ source: sourceJson(source, locale), resolved }, { status: 201 })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
