import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { APP_PATHS, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localizePath, matchLocale, splitLocale, type Locale } from "@/lib/i18n/config"
import { IMPERSONATION_COOKIE, IMPERSONATION_READ_ONLY, impersonationBlocks } from "@/lib/impersonation"
import { safeNextPath } from "@/lib/next-path"

const SESSION_COOKIE = "apex_session"
const SIGNED_IN_COOKIE = "apex_signed_in"

// The app pages are for logged-in users only; everyone else lands on the login modal.
// This only checks the cookie exists, as a cheap early redirect. It is NOT an authorization
// layer: any value passes, so every page and API route must validate the session itself.
const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/verify-email", "/admin"]

const under = (pathname: string, roots: string[]) => roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))

// The app pages (no locale in their URLs) follow the language the visitor last browsed in
function remember(request: NextRequest, response: NextResponse, locale: Locale) {
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  }
  return response
}

// The remembered language (switcher choice or last visit) wins over the browser's languages
function preferredLocale(request: NextRequest) {
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(chosen) ? chosen : (matchLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE)
}

function route(request: NextRequest, signedIn: boolean) {
  const { pathname, search, searchParams } = request.nextUrl
  const to = (path: string, status: 307 | 308 = 307) => NextResponse.redirect(new URL(path, request.url), status)

  if (under(pathname, APP_PATHS)) {
    if (!signedIn && under(pathname, PROTECTED_PATHS)) {
      // a plan picked on the pricing page survives the detour through log-in (lib/next-path.ts)
      const next = safeNextPath(pathname + search)
      return to(localizePath("/login", preferredLocale(request)) + (next ? `?next=${encodeURIComponent(next)}` : ""))
    }
    return NextResponse.next()
  }

  const { locale, path, prefixed } = splitLocale(pathname)

  // Old modal links (/?login=1, /?signup=1) land on the clean routes
  if (path === "/" && (searchParams.get("signup") === "1" || searchParams.get("login") === "1")) {
    const error = searchParams.get("error")
    const target = searchParams.get("signup") === "1" ? "/signup" : `/login${error ? `?error=${encodeURIComponent(error)}` : ""}`
    return to(localizePath(target, locale))
  }

  // /en/pricing duplicates /pricing: send it to the one canonical URL
  if (prefixed && locale === DEFAULT_LOCALE) return to(path + search, 308)
  if (prefixed) return remember(request, NextResponse.next(), locale)

  // An unprefixed URL is the default language, unless the visitor prefers another one we have.
  // Crawlers send no cookie and usually no Accept-Language, so they always get the canonical page.
  const preferred = preferredLocale(request)
  if (preferred !== DEFAULT_LOCALE) return to(localizePath(pathname, preferred) + search)

  const url = request.nextUrl.clone()
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`
  return remember(request, NextResponse.rewrite(url), DEFAULT_LOCALE)
}

export function proxy(request: NextRequest) {
  // Viewing as a user is read-only: refuse every write, API or page, before any route runs
  if (impersonationBlocks(request.method, request.nextUrl.pathname, request.cookies.has(IMPERSONATION_COOKIE))) {
    return NextResponse.json(IMPERSONATION_READ_ONLY, { status: 403 })
  }
  // API routes only pass through for that check
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next()

  const signedIn = request.cookies.has(SESSION_COOKIE)
  const response = route(request, signedIn)

  // Keep the readable "signed in" hint (lib/signed-in.ts) in step with the session cookie,
  // including sessions created before the hint existed
  const hinted = request.cookies.get(SIGNED_IN_COOKIE)?.value === "1"
  if (signedIn && !hinted) {
    response.cookies.set(SIGNED_IN_COOKIE, "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" })
  } else if (!signedIn && hinted) {
    response.cookies.delete(SIGNED_IN_COOKIE)
  }
  return response
}

export const config = {
  // Every page and API route; not Next internals or files such as /sitemap.xml and /icon.png
  matcher: ["/((?!api/|_next/|.*\\..*).*)", "/api/:path*"],
}
