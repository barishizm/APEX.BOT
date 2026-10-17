import { ADMIN_USERS_LIST, type AdminUserRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The admin user list; see lib/admin-list.ts for the query string
export const GET = adminListRoute<AdminUserRow>({
  name: "users",
  spec: ADMIN_USERS_LIST,
  csv: [
    { header: "id", value: (u) => u.id },
    { header: "email", value: (u) => u.email },
    { header: "username", value: (u) => u.username },
    { header: "display_name", value: (u) => u.display_name },
    { header: "account_type", value: (u) => u.account_type },
    { header: "platform_role", value: (u) => u.platform_role },
    { header: "email_verified", value: (u) => u.email_verified },
    { header: "two_factor", value: (u) => u.two_factor },
    { header: "workspaces", value: (u) => u.workspaces },
    { header: "suspended_at", value: (u) => u.suspended_at },
    { header: "last_login_at", value: (u) => u.last_login_at },
    { header: "created_at", value: (u) => u.created_at },
  ],
})
