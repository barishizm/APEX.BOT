import { after } from "next/server"
import { KnowledgeError, addAllowedOrigin, addFileSource, addTextSource, addWebsiteSource, knowledgeLimits, listSources, startSync } from "@apex/db"
import { chunkText, normalizeStartUrl } from "@apex/knowledge"
import { errorJson, readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { translateMessage } from "@/lib/i18n/messages"
import { requestLocale } from "@/lib/i18n/server"
import { crawlInto, knowledgeErrorResponse, readUpload, sourceJson } from "@/lib/knowledge"
import { siteScope } from "@/lib/current-site"

export async function GET() {
  try {
    const user = await requireApiUser()
    const scope = await siteScope(user.id)
    const [sources, limits, locale] = await Promise.all([listSources(db(), scope), knowledgeLimits(db(), scope), requestLocale()])
    return Response.json({ sources: sources.map((s) => sourceJson(s, locale)), limits })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}

// a website is read in the background (after()), which shares this limit
export const maxDuration = 300

// Body: { kind: "website", url, allowOrigin? } or { kind: "text", title, content }, or a form with `file`
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const locale = await requestLocale()
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      // a cross-site <form> can send multipart without a preflight (readJson's guard); only our own page may
      const site = request.headers.get("sec-fetch-site")
      if (site && site !== "same-origin") return errorJson("forbidden", "Upload the file from your dashboard", { status: 403 })
      const file = (await request.formData().catch(() => null))?.get("file")
      if (!(file instanceof File)) return errorJson("invalid_input", "Choose a file", { status: 400 })
      const upload = await readUpload(file)
      const source = await addFileSource(db(), await siteScope(user.id), upload, (title, content) => chunkText(title, content))
      return Response.json({ source: sourceJson(source, locale) }, { status: 201 })
    }
    const body = await readJson(request)
    if (body.kind === "text") {
      const source = await addTextSource(db(), await siteScope(user.id), { title: body.title, content: body.content }, (title, content) => chunkText(title, content))
      return Response.json({ source: sourceJson(source, locale) }, { status: 201 })
    }
    if (body.kind !== "website") return errorJson("invalid_input", "Choose a website or a text", { status: 400 })

    const url = normalizeStartUrl(typeof body.url === "string" ? body.url : "")
    const added = await addWebsiteSource(db(), await siteScope(user.id), url)
    // onboarding: the site the customer gave us is where the widget will run
    if (body.allowOrigin === true) await addAllowedOrigin(db(), await siteScope(user.id), new URL(url).origin)
    if (added.status === "syncing") return Response.json({ source: sourceJson(added, locale) }, { status: 200 })
    try {
      const source = await startSync(db(), await siteScope(user.id), added.id)
      after(() => crawlInto(source))
      return Response.json({ source: sourceJson(source, locale) }, { status: 201 })
    } catch (err) {
      // saved, but other websites are still being read: it waits for a manual sync
      if (err instanceof KnowledgeError && err.code === "busy") return Response.json({ source: sourceJson(added, locale), notice: translateMessage(err.message, locale) }, { status: 201 })
      throw err
    }
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
