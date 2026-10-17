import { acceptInvitation } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { forgetSite } from "@/lib/current-site"

// Body: { token } from the invitation link. Joins the workspace and switches to it.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { token } = await readJson(request)
    const joined = await acceptInvitation(db(), user.id, token)
    await forgetSite()
    return Response.json(joined)
  } catch (err) {
    return botErrorResponse(err)
  }
}
