import { ADMIN_WAITLIST_LIST, type AdminWaitlistRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The waitlist (/admin/waitlist); see lib/admin-list.ts for the query string
export const GET = adminListRoute<AdminWaitlistRow>({
  name: "waitlist",
  spec: ADMIN_WAITLIST_LIST,
  csv: [
    { header: "email", value: (w) => w.email },
    { header: "locale", value: (w) => w.locale },
    { header: "joined_at", value: (w) => w.created_at },
    { header: "invited_at", value: (w) => w.invited_at },
    { header: "invites_sent", value: (w) => w.invite_count },
    { header: "signed_up", value: (w) => w.signed_up },
  ],
})
