import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site"

const PATHS = ["", "/pricing", "/docs", "/status", "/privacy", "/terms"]

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({ url: `${siteUrl()}${p}`, changeFrequency: p === "/status" ? "hourly" : "monthly", priority: p === "" ? 1 : 0.6 }))
}
