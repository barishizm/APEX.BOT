import type { MetadataRoute } from "next"
import { DEFAULT_LOCALE } from "@/lib/i18n"
import { getDictionary } from "@/lib/i18n/server"

export default function manifest(): MetadataRoute.Manifest {
  const t = getDictionary(DEFAULT_LOCALE)
  return {
    name: t.meta.siteName,
    short_name: t.meta.siteName,
    description: t.meta.description,
    start_url: "/",
    display: "browser",
    background_color: "#f4f4f1",
    theme_color: "#0c0c09",
    icons: [
      { src: "/icon.png", type: "image/png", sizes: "512x512" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  }
}
