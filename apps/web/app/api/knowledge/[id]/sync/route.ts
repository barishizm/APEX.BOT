import { after } from "next/server"
import { startSync } from "@apex/db"
import { requireApiUser } from "@/lib/bot"
import { requestLocale } from "@/lib/i18n/server"
import { db } from "@/lib/db"
import { crawlInto, knowledgeErrorResponse, sourceJson } from "@/lib/knowledge"

// Reads a website source again; its current content stays searchable until the new crawl finishes
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const source = await startSync(db(), user.id, (await params).id)
    after(() => crawlInto(source.id, source.url))
    return Response.json({ source: sourceJson(source, await requestLocale()) })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
