import { rotateSiteKey } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, botJson, requireApiUser } from "@/lib/bot"
import { siteScope } from "@/lib/current-site"

// Body: { botId }. Issues a new public key. JSON body required so a cross-site form can't trigger it.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { botId } = await readJson(request)
    return Response.json(botJson(await rotateSiteKey(db(), await siteScope(user.id, botId))))
  } catch (err) {
    return botErrorResponse(err)
  }
}
