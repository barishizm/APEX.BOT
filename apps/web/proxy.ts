import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { APP_PATHS, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localizePath, matchLocale, splitLocale } from "@/lib/i18n/config"

const SESSION_COOKIE = "apex_session"
const SIGNED_IN_COOKIE = "apex_signed_in"

// The app pages are for logged-in users only; everyone else lands on the login modal.
// This only checks the cookie exists, as a cheap early redirect. It is NOT an authorization
// layer: any value passes, so every page and API route must validate the session itself.
const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/verify-email"]

const under = (pathname: string, roots: string[]) => roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))

// An explicit choice (the language switcher's cookie) wins over the browser's languages
function preferredLocale(request: NextRequest) {
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(chosen) ? chosen : (matchLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE)
}

function route(request: NextRequest, signedIn: boolean) {
  const { pathname, search, searchParams } = request.nextUrl
  const to = (path: string, status: 307 | 308 = 307) => NextResponse.redirect(new URL(path, request.url), status)

  if (under(pathname, APP_PATHS)) {
    if (!signedIn && under(pathname, PROTECTED_PATHS)) return to(localizePath("/login", preferredLocale(request)))
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
  if (prefixed) return NextResponse.next()

  // An unprefixed URL is the default language, unless the visitor prefers another one we have.
  // Crawlers send no cookie and usually no Accept-Language, so they always get the canonical page.
  const preferred = preferredLocale(request)
  if (preferred !== DEFAULT_LOCALE) return to(localizePath(pathname, preferred) + search)

  const url = request.nextUrl.clone()
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`
  return NextResponse.rewrite(url)
}

export function proxy(request: NextRequest) {
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
  // Every page; not API routes, Next internals or files such as /sitemap.xml and /icon.png
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
}
