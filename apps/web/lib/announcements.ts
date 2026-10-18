import { announcementText, type Announcement } from "@apex/db"
import type { AnnouncementJson } from "@/components/announcement-banner"
import type { Locale } from "@/lib/i18n"

/** What a banner needs of an announcement, in the viewer's language. */
export const announcementJson = (a: Announcement, locale: Locale): AnnouncementJson => ({
  id: a.id,
  level: a.level,
  text: announcementText(a, locale),
  dismissible: a.dismissible,
  version: a.updatedAt.toISOString(),
})
