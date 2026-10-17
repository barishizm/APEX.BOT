import { deleteAccount, getAccount, updateProfile } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, clearSessionCookie, readJson, requestMeta, requireSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await requireSession()
    return Response.json(await getAccount(db(), session.user.id, session.sessionId))
  } catch (err) {
    return authErrorResponse(err)
  }
}

// Body: { username?, displayName?, allowTraining? }
export async function PATCH(request: Request) {
  try {
    const session = await requireSession()
    const b = await readJson(request)
    const user = await updateProfile(db(), session.user.id, { username: b.username, displayName: b.displayName, allowTraining: b.allowTraining }, await requestMeta())
    return Response.json({ user })
  } catch (err) {
    return authErrorResponse(err)
  }
}

// Body: { confirmEmail }. Erases the account and the workspaces only it belongs to.
export async function DELETE(request: Request) {
  try {
    const session = await requireSession()
    const { confirmEmail } = await readJson(request)
    await deleteAccount(db(), session.user.id, confirmEmail, await requestMeta())
    await clearSessionCookie()
    return new Response(null, { status: 204 })
  } catch (err) {
    return authErrorResponse(err)
  }
}
