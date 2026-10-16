import type { MetadataRoute } from "next"
import { LOCALES, localizePath } from "@/lib/i18n"
import { languageAlternates } from "@/lib/i18n/server"
import { siteUrl } from "@/lib/site"

const PATHS = ["/", "/pricing", "/docs", "/status", "/privacy", "/security", "/terms"]

// Every page in every language, each listing its translations (hreflang) for search engines
export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: siteUrl() + localizePath(path, locale),
      changeFrequency: path === "/status" ? ("hourly" as const) : ("monthly" as const),
      priority: path === "/" ? 1 : 0.6,
      alternates: { languages: languageAlternates(path) },
    })),
  )
}
