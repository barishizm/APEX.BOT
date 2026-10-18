import { liveAnnouncements, marketingAnnouncements } from "@apex/db"
import { announcementJson } from "@/lib/announcements"
import { db } from "@/lib/db"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config"

// GET /api/announcements?locale=tr → { announcements }: the banners for the public site
// (components/announcement-banner.tsx). Public, so it only ever returns announcements to everyone
// that staff marked for the website; the CDN may keep the answer as long as the server's cache.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("locale")
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE
  try {
    const announcements = marketingAnnouncements(await liveAnnouncements(db())).map((a) => announcementJson(a, locale))
    return Response.json({ announcements }, { headers: { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" } })
  } catch (err) {
    console.error("[announcements]", err instanceof Error ? err.message : err)
    return Response.json({ announcements: [] }, { headers: { "cache-control": "no-store" } })
  }
}
