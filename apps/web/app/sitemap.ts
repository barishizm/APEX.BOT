import type { MetadataRoute } from "next"
import { PUBLIC_PAGES } from "@/content"
import { LOCALES } from "@/lib/i18n"
import { absoluteUrl, languageAlternates } from "@/lib/i18n/server"

// Every indexable page in every language, each listing its translations (hreflang) and when it last changed.
// /status is left out on purpose: it is a live check with nothing for search engines to rank.
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(PUBLIC_PAGES).flatMap(([path, updated]) =>
    LOCALES.map((locale) => ({
      url: absoluteUrl(path, locale),
      lastModified: updated,
      alternates: { languages: languageAlternates(path) },
    })),
  )
}
