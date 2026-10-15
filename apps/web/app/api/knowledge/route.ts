import { after } from "next/server"
import { KNOWLEDGE_LIMITS, KnowledgeError, addAllowedOrigin, addTextSource, addWebsiteSource, listSources, startSync } from "@apex/db"
import { chunkText, normalizeStartUrl } from "@apex/knowledge"
import { readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { crawlInto, knowledgeErrorResponse, sourceJson } from "@/lib/knowledge"

export async function GET() {
  try {
    const user = await requireApiUser()
    const sources = await listSources(db(), user.id)
    return Response.json({ sources: sources.map(sourceJson), limits: KNOWLEDGE_LIMITS })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}

// Body: { kind: "website", url, allowOrigin? } or { kind: "text", title, content }
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await readJson(request)
    if (body.kind === "text") {
      const source = await addTextSource(db(), user.id, { title: body.title, content: body.content }, (title, content) => chunkText(title, content))
      return Response.json({ source: sourceJson(source) }, { status: 201 })
    }
    if (body.kind !== "website") return Response.json({ error: "invalid_input", message: "Choose a website or a text" }, { status: 400 })

    const url = normalizeStartUrl(typeof body.url === "string" ? body.url : "")
    const added = await addWebsiteSource(db(), user.id, url)
    // onboarding: the site the customer gave us is where the widget will run
    if (body.allowOrigin === true) await addAllowedOrigin(db(), user.id, new URL(url).origin)
    if (added.status === "syncing") return Response.json({ source: sourceJson(added) }, { status: 200 })
    try {
      const source = await startSync(db(), user.id, added.id)
      after(() => crawlInto(source.id, source.url))
      return Response.json({ source: sourceJson(source) }, { status: 201 })
    } catch (err) {
      // saved, but other websites are still being read: it waits for a manual sync
      if (err instanceof KnowledgeError && err.code === "busy") return Response.json({ source: sourceJson(added), notice: err.message }, { status: 201 })
      throw err
    }
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
