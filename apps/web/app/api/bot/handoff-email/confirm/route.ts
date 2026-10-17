import { confirmHandoffEmail } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, botJson, requireApiUser } from "@/lib/bot"
import { siteScope } from "@/lib/current-site"

// Body: { code, botId }. Confirms the address the last code was sent to.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { code, botId } = await readJson(request)
    return Response.json(botJson(await confirmHandoffEmail(db(), await siteScope(user.id, botId), code)))
  } catch (err) {
    return botErrorResponse(err)
  }
}
