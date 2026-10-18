import { clearSettingsCache, createAnnouncement } from "@apex/db"
import { withAdminAction } from "@/lib/admin"

// POST /api/admin/announcements, body { reason, level, message: { en, tr?, … }, startsAt?, endsAt?,
// audience, plans?, organizationIds?, marketing?, dismissible? } → { announcement }.
// Banners reach every customer, so only superadmins write them; nothing is destroyed, so no step-up.
export const POST = withAdminAction({ action: "announcement.create", targetType: "announcement", minRole: "superadmin", stepUp: false }, async ({ tx, admin, body }) => {
  const c = await createAnnouncement(tx, admin.user.id, body)
  return { targetId: c.extra.announcement.id, before: c.before, after: c.after, result: { announcement: c.extra.announcement }, afterCommit: async () => clearSettingsCache() }
})
