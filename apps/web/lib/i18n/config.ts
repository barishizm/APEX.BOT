// Every supported language lives here. Adding one means: add its code below, give it an
// entry in LOCALE_META, and add a dictionary in ./dictionaries (and the long-form pages in
// content/). TypeScript flags every place that is still missing a translation.
export const LOCALES = ["en", "tr"] as const
export type Locale = (typeof LOCALES)[number]

// Served without a URL prefix (/pricing); every other locale is prefixed (/tr/pricing)
export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_META: Record<Locale, { name: string; hreflang: string; ogLocale: string; intl: string; dir: "ltr" | "rtl" }> = {
  en: { name: "English", hreflang: "en", ogLocale: "en_US", intl: "en-GB", dir: "ltr" },
  tr: { name: "Türkçe", hreflang: "tr", ogLocale: "tr_TR", intl: "tr-TR", dir: "ltr" },
}

// Set when a visitor picks a language, so we stop guessing from Accept-Language
export const LOCALE_COOKIE = "NEXT_LOCALE"

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value)

// The signed-in app (outside app/[lang]) is not localized; its URLs never get a prefix
export const APP_PATHS = ["/dashboard", "/onboarding", "/verify-email", "/forgot-password", "/database-update"]
const isAppPath = (path: string) =>
  APP_PATHS.some((root) => path.startsWith(root) && (path.length === root.length || "/?#".includes(path[root.length])))

// "/pricing#faq" -> "/tr/pricing#faq". External links, mailto:, API routes and app pages pass through.
export function localizePath(path: string, locale: Locale) {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api/") || isAppPath(path)) return path
  if (locale === DEFAULT_LOCALE) return path
  const rest = path === "/" ? "" : path.startsWith("/#") || path.startsWith("/?") ? path.slice(1) : path
  return `/${locale}${rest}`
}

// "/tr/pricing" -> { locale: "tr", path: "/pricing" }; unprefixed paths are the default locale
export function splitLocale(pathname: string): { locale: Locale; path: string; prefixed: boolean } {
  const first = pathname.split("/")[1]
  if (isLocale(first)) return { locale: first, path: pathname.slice(first.length + 1) || "/", prefixed: true }
  return { locale: DEFAULT_LOCALE, path: pathname || "/", prefixed: false }
}

// Best supported match for an Accept-Language header, honoring q-values ("tr-TR,tr;q=0.9,en;q=0.8")
export function matchLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null
  const ranked = acceptLanguage
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";")
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="))
      return { base: tag.split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i }
    })
    .filter((l) => l.base && l.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  return ranked.map((l) => l.base).find(isLocale) ?? null
}
