import { getBotForUser, saveBotSettings } from "@apex/db"
import { db } from "@/lib/db"
import { isImpersonating, readJson } from "@/lib/auth"
import { botErrorResponse, botJson, requireApiUser } from "@/lib/bot"
import { siteScope } from "@/lib/current-site"

export async function GET() {
  try {
    const user = await requireApiUser()
    return Response.json(botJson(await getBotForUser(db(), await siteScope(user.id), { readOnly: await isImpersonating() })))
  } catch (err) {
    return botErrorResponse(err)
  }
}

// Body: { botId, settings, version } where version is the one the editor loaded
export async function PUT(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await readJson(request)
    const version = typeof body.version === "number" && Number.isInteger(body.version) ? body.version : -1
    return Response.json(botJson(await saveBotSettings(db(), await siteScope(user.id, body.botId), body.settings, version)))
  } catch (err) {
    return botErrorResponse(err)
  }
}
