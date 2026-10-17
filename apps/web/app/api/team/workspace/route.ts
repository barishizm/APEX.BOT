import { setActiveWorkspace } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { forgetSite } from "@/lib/current-site"

// Body: { organizationId }. Switches the workspace the dashboard shows.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { organizationId } = await readJson(request)
    await setActiveWorkspace(db(), user.id, organizationId)
    await forgetSite()
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
