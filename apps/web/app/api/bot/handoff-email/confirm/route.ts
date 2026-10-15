import { confirmHandoffEmail } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, botJson, requireApiUser } from "@/lib/bot"

// Body: { code }. Confirms the address the last code was sent to.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { code } = await readJson(request)
    return Response.json(botJson(await confirmHandoffEmail(db(), user.id, code)))
  } catch (err) {
    return botErrorResponse(err)
  }
}
