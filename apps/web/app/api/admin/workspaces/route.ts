import { ADMIN_WORKSPACES_LIST, type AdminWorkspaceRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The admin workspace list; see lib/admin-list.ts for the query string
export const GET = adminListRoute<AdminWorkspaceRow>({
  name: "organizations",
  spec: ADMIN_WORKSPACES_LIST,
  csv: [
    { header: "id", value: (w) => w.id },
    { header: "name", value: (w) => w.name },
    { header: "plan", value: (w) => w.plan },
    { header: "size", value: (w) => w.size },
    { header: "owner_email", value: (w) => w.owner_email },
    { header: "members", value: (w) => w.members },
    { header: "bots", value: (w) => w.bots },
    { header: "last_activity_at", value: (w) => w.last_activity_at },
    { header: "suspended_at", value: (w) => w.suspended_at },
    { header: "created_at", value: (w) => w.created_at },
  ],
})
