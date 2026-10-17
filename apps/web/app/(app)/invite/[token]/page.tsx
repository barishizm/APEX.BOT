import type { Metadata } from "next"
import { getInvitation } from "@apex/db"
import InviteView from "@/components/team/invite-view"
import { currentSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).team.title, robots: { index: false } }
}

// Where an invitation email links to: who invited you where, and a way to accept
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [invitation, session] = await Promise.all([getInvitation(db(), token), currentSession()])
  return (
    <InviteView
      token={token}
      invitation={invitation}
      viewer={session ? { email: session.user.email, verified: session.user.emailVerified } : null}
    />
  )
}
