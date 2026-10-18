import { endImpersonation } from "@apex/db"
import { clearImpersonationCookie, impersonationToken, requestMeta } from "@/lib/auth"
import { db } from "@/lib/db"

// POST: ends "view as user" and drops its cookie; the staff member's own session was never touched.
// The one write the proxy lets through while viewing as a user (lib/impersonation.ts). It needs no
// staff session: whoever holds the cookie may end the view, and ending it is audited for the staff
// member who started it. Answers where to go next: back to that user's admin page.
export async function POST() {
  const token = await impersonationToken()
  // first, so a database error can't leave the browser stuck read-only; without the cookie the
  // token is gone, and the row runs out on its own
  await clearImpersonationCookie()
  try {
    const ended = await endImpersonation(db(), token, await requestMeta())
    return Response.json({ next: ended ? `/admin/users/${ended.targetUserId}` : "/admin" })
  } catch (err) {
    console.error("[admin] impersonation exit: couldn't record the end", err)
    return Response.json({ next: "/admin" })
  }
}
