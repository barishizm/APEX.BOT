import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/onboarding", "/verify-email", "/forgot-password", "/database-update"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
