import { STEP_UP_TTL_MS, stepUpSession } from "@apex/db"
import { authErrorResponse, readJson, requestMeta, requireAdminSession } from "@/lib/auth"
import { db } from "@/lib/db"

const until = (at: Date | null) => (at ? new Date(at.getTime() + STEP_UP_TTL_MS).toISOString() : null)

// Until when destructive admin actions are confirmed for this session (null: ask for a code first)
export async function GET() {
  try {
    const admin = await requireAdminSession()
    const expires = until(admin.stepUpAt)
    return Response.json({ stepUpUntil: expires && expires > new Date().toISOString() ? expires : null })
  } catch (err) {
    return authErrorResponse(err)
  }
}

// Body: { code } from the authenticator app. Confirms destructive admin actions for 10 minutes.
export async function POST(request: Request) {
  try {
    const admin = await requireAdminSession("support", { write: true })
    const { code } = await readJson(request)
    const at = await stepUpSession(db(), admin.user.id, admin.sessionId, code, await requestMeta())
    return Response.json({ stepUpUntil: until(at) })
  } catch (err) {
    return authErrorResponse(err)
  }
}
