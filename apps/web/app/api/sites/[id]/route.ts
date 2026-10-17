import { cookies } from "next/headers"
import { deleteBot, renameBot } from "@apex/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { SITE_COOKIE, forgetSite } from "@/lib/current-site"
import { db } from "@/lib/db"

type Params = { params: Promise<{ id: string }> }

// Body: { name }. Renames the website in the dashboard; visitors never see this name.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireApiUser()
    const { name } = await readJson(request)
    const bot = await renameBot(db(), { userId: user.id, botId: (await params).id }, name)
    return Response.json({ id: bot.id, name: bot.name })
  } catch (err) {
    return botErrorResponse(err)
  }
}

// Removes the website with its knowledge and conversations; its embed stops working
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    await deleteBot(db(), { userId: user.id, botId: id })
    if ((await cookies()).get(SITE_COOKIE)?.value === id) await forgetSite()
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
