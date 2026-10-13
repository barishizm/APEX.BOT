import { rotateSiteKey } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, botJson, requireApiUser } from "@/lib/bot"

// Issues a new public key. JSON body required so a cross-site form can't trigger it.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    await readJson(request)
    return Response.json(botJson(await rotateSiteKey(db(), user.id)))
  } catch (err) {
    return botErrorResponse(err)
  }
}
