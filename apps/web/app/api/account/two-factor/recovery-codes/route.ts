import { regenerateRecoveryCodes } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, requireSession } from "@/lib/auth"

// Body: { code }. Replaces the recovery codes; the old ones stop working.
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const { code } = await readJson(request)
    return Response.json(await regenerateRecoveryCodes(db(), session.user.id, code, await requestMeta()))
  } catch (err) {
    return authErrorResponse(err)
  }
}
