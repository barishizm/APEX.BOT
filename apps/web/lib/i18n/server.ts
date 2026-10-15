// Server-side only: imports every dictionary.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { siteUrl } from "@/lib/site"
import { DEFAULT_LOCALE, isLocale, LOCALE_META, LOCALES, localizePath, type Locale } from "./config"
import { en, type Dictionary } from "./dictionaries/en"
import { tr } from "./dictionaries/tr"

const DICTIONARIES: Record<Locale, Dictionary> = { en, tr }

export const getDictionary = (locale: Locale) => DICTIONARIES[locale]

// For pages under app/[lang]: an unknown segment is a 404, not a crash
export async function resolveLocale(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  return lang
}

export const generateLocaleParams = () => LOCALES.map((lang) => ({ lang }))

// app/opengraph-image.png sits above both root layouts, so pages reference it explicitly
const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Apex Bot" }

// Absolute URL of `path` in every language, plus x-default for visitors we can't match
export function languageAlternates(path: string) {
  const languages: Record<string, string> = {}
  for (const locale of LOCALES) languages[LOCALE_META[locale].hreflang] = siteUrl() + localizePath(path, locale)
  languages["x-default"] = siteUrl() + localizePath(path, DEFAULT_LOCALE)
  return languages
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
    alternates: index ? { canonical: url, languages: languageAlternates(path) } : { canonical: localizePath("/", locale) },
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
