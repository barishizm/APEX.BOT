import { getTeam, inviteMember } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { requestLocale } from "@/lib/i18n/server"
import { sendInvitation } from "@/lib/mail"
import { siteOrigin } from "@/lib/oauth"

export async function GET() {
  try {
    const user = await requireApiUser()
    return Response.json(await getTeam(db(), user.id))
  } catch (err) {
    return botErrorResponse(err)
  }
}

// Body: { email, role: "admin" | "member" }. Emails an invitation link.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const b = await readJson(request)
    const { invite, token, workspaceName } = await inviteMember(db(), user.id, { email: b.email, role: b.role })
    await sendInvitation(invite.email, {
      workspace: workspaceName,
      inviter: user.displayName ?? user.username,
      link: `${siteOrigin()}/invite/${token}`,
      locale: await requestLocale(),
    })
    return Response.json({ invite }, { status: 201 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
