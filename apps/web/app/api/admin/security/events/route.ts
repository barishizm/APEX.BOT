import { ADMIN_SECURITY_EVENTS_LIST, deviceLabel, type AuthEventRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The security feed on /admin/security (app.auth_events); see lib/admin-list.ts for the query string
export const GET = adminListRoute<AuthEventRow>({
  name: "auth_events",
  spec: ADMIN_SECURITY_EVENTS_LIST,
  toJson: (e) => ({ ...e, device: deviceLabel(e.user_agent) }),
  csv: [
    { header: "id", value: (e) => e.id },
    { header: "event", value: (e) => e.event },
    { header: "email", value: (e) => e.email },
    { header: "ip", value: (e) => e.ip },
    { header: "country", value: (e) => e.country },
    { header: "user_agent", value: (e) => e.user_agent },
    { header: "user_id", value: (e) => e.user_id },
    { header: "created_at", value: (e) => e.created_at },
  ],
})
