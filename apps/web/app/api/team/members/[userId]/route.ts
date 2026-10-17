import { changeMemberRole, removeMember } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { forgetSite } from "@/lib/current-site"

// Body: { role: "owner" | "admin" | "member" }
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await requireApiUser()
    const { role } = await readJson(request)
    await changeMemberRole(db(), user.id, (await params).userId, role)
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}

// Removes someone, or with your own id, leaves the workspace
export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await requireApiUser()
    const { left } = await removeMember(db(), user.id, (await params).userId)
    // the website picked in this browser belonged to the workspace just left
    if (left) await forgetSite()
    return Response.json({ left })
  } catch (err) {
    return botErrorResponse(err)
  }
}
