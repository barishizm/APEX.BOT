import type { MetadataRoute } from "next"
import { APP_PATHS } from "@/lib/i18n"
import { siteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  return {
    // /login and /signup stay crawlable so search engines can see their noindex
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...APP_PATHS] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
