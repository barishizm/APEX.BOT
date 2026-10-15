import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// The app pages are for logged-in users only; everyone else lands on the login modal.
// This only checks the cookie exists, as a cheap early redirect. It is NOT an authorization
// layer: any value passes, so every page and API route must validate the session itself.
export function proxy(request: NextRequest) {
  if (request.cookies.has("apex_session")) return NextResponse.next()
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/onboarding", "/verify-email"],
}
