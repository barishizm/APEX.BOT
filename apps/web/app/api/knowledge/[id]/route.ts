import { deleteSource, getSourceDetail, updateSource } from "@apex/db"
import { chunkText } from "@apex/knowledge"
import { readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { requestLocale } from "@/lib/i18n/server"
import { knowledgeErrorResponse, sourceJson } from "@/lib/knowledge"

type Params = { params: Promise<{ id: string }> }

// A source with its content (text) or pages (website) and every excerpt made from it
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireApiUser()
    const [detail, locale] = await Promise.all([getSourceDetail(db(), user.id, (await params).id), requestLocale()])
    return Response.json({ ...detail, source: sourceJson(detail.source, locale) })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}

// Body: { title?, content? }; content only for text sources
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireApiUser()
    const body = await readJson(request)
    const source = await updateSource(db(), user.id, (await params).id, { title: body.title, content: body.content }, (title, content) => chunkText(title, content))
    return Response.json({ source: sourceJson(source, await requestLocale()) })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireApiUser()
    await deleteSource(db(), user.id, (await params).id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return knowledgeErrorResponse(err)
  }
}
