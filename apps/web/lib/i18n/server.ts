// Server-side only: imports every dictionary.
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { notFound } from "next/navigation"
import { billingLive } from "@/lib/billing/live"
import { siteUrl } from "@/lib/site"
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALE_META, LOCALES, localizePath, matchLocale, type Locale } from "./config"
import { en, type Dictionary } from "./dictionaries/en"
import { et } from "./dictionaries/et"
import { lt } from "./dictionaries/lt"
import { lv } from "./dictionaries/lv"
import { tr } from "./dictionaries/tr"

const DICTIONARIES: Record<Locale, Dictionary> = { en, tr, lt, lv, et }

export const getDictionary = (locale: Locale) => DICTIONARIES[locale]

/** `dict` with its `launch` wording in place of "free during the beta", for once plans are on sale. */
export function withLaunchCopy(dict: Dictionary): Dictionary {
  const l = dict.launch
  return {
    ...dict,
    meta: { ...dict.meta, pricing: { ...dict.meta.pricing, description: l.metaPricing }, signup: { ...dict.meta.signup, description: l.metaSignup } },
    hero: { ...dict.hero, badge: l.heroBadge, note: l.heroNote },
    landing: {
      ...dict.landing,
      faq: { ...dict.landing.faq, items: dict.landing.faq.items.map((item) => (item.q === l.faqCost.q ? l.faqCost : item)) },
      closing: { ...dict.landing.closing, lede: l.closingLede },
    },
    pricing: { ...dict.pricing, titleA: l.pricingTitleA, titleB: l.pricingTitleB, lede: l.pricingLede },
  }
}

/**
 * The public pages' dictionary: the beta wording until billing is live (lib/billing/live.ts). Pages
 * that use it are regenerated every minute (revalidate in app/[lang]/layout.tsx), and at once when
 * staff flip the flag.
 */
export async function getMarketingDictionary(locale: Locale): Promise<Dictionary> {
  return (await billingLive()) ? withLaunchCopy(getDictionary(locale)) : getDictionary(locale)
}

// For pages under app/[lang]: an unknown segment is a 404, not a crash
export async function resolveLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  return lang
}

// Language of an app page or API request (no locale in the URL): the visitor's choice or the
// last language they browsed the site in (cookie), else their browser's languages
export async function requestLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen
  return matchLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE
}

export const generateLocaleParams = () => LOCALES.map((lang) => ({ lang }))

// app/opengraph-image.png sits above both root layouts, so pages reference it explicitly
const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Apex Bot" }

// Absolute URL of `path` in `locale`, written the way Next prints canonicals (the home page has no trailing slash)
export function absoluteUrl(path: string, locale: Locale) {
  const localized = localizePath(path, locale)
  return localized === "/" ? siteUrl() : siteUrl() + localized
}

// Absolute URL of `path` in every language, plus x-default for visitors we can't match
export function languageAlternates(path: string) {
  const languages: Record<string, string> = {}
  for (const locale of LOCALES) languages[LOCALE_META[locale].hreflang] = absoluteUrl(path, locale)
  languages["x-default"] = absoluteUrl(path, DEFAULT_LOCALE)
  return languages
}

// BreadcrumbList from the home page down to the current page; `trail` excludes the home page
export function breadcrumbs(locale: Locale, trail: { name: string; path: string }[]) {
  const items = [{ name: getDictionary(locale).meta.siteName, path: "/" }, ...trail]
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path, locale) })),
  }
}

// Title, description, canonical, hreflang, Open Graph and Twitter tags for one localized page.
// `title` is the page's own name; the layout's template adds the brand.
export function pageMetadata({
  locale,
  path,
  title,
  description,
  index = true,
}: {
  locale: Locale
  path: string
  title?: string
  description?: string
  index?: boolean
}): Metadata {
  const t = getDictionary(locale)
  const url = localizePath(path, locale)
  const fullTitle = title ? t.meta.titleTemplate.replace("%s", title) : t.meta.defaultTitle
  const desc = description ?? t.meta.description
  return {
    ...(title ? { title } : { title: { absolute: t.meta.defaultTitle } }),
    description: desc,
    // A noindex page points at itself: a canonical to another URL would contradict the noindex
    alternates: index ? { canonical: url, languages: languageAlternates(path) } : { canonical: url },
    robots: index ? undefined : { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: t.meta.siteName,
      title: fullTitle,
      description: desc,
      url,
      locale: LOCALE_META[locale].ogLocale,
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_META[l].ogLocale),
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description: desc, images: [OG_IMAGE.url] },
  }
}

// JSON-LD must not be able to close its own <script> tag
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c")
