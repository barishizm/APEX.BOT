import { NextResponse } from "next/server"
import { clearSessionCookie, currentSession } from "@/lib/auth"

// App pages send a session cookie whose session has ended (expired, revoked, signed out elsewhere)
// here, because server components can't clear cookies. Left in place, the cookie keeps the
// "signed in" hint alive and the marketing pages keep offering a dashboard that bounces to log-in.
export async function GET(request: Request) {
  let valid = true
  try {
    valid = !!(await currentSession())
  } catch {
    // database trouble says nothing about the cookie; keep it
  }
  // only a dead session is cleared, so a cross-site link here can't sign anyone out
  if (valid) return NextResponse.redirect(new URL("/dashboard", request.url))
  await clearSessionCookie()
  return NextResponse.redirect(new URL("/login", request.url))
}
