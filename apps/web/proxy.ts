import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// The app pages are for logged-in users only; everyone else lands on the login modal.
// This only checks the cookie exists; the pages themselves validate the session.
export function proxy(request: NextRequest) {
  if (request.cookies.has("apex_session")) return NextResponse.next()
  return NextResponse.redirect(new URL("/?login=1", request.url))
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/onboarding", "/verify-email"],
}
