import { ADMIN_BOTS_LIST, type AdminBotRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The admin bot list; see lib/admin-list.ts for the query string
export const GET = adminListRoute<AdminBotRow>({
  name: "bots",
  spec: ADMIN_BOTS_LIST,
  // bigint comes back from Postgres as a string
  toJson: (b) => ({ ...b, today_tokens: Number(b.today_tokens) }),
  csv: [
    { header: "id", value: (b) => b.id },
    { header: "name", value: (b) => b.name },
    { header: "workspace_id", value: (b) => b.organization_id },
    { header: "workspace", value: (b) => b.organization_name },
    { header: "site_key_tail", value: (b) => b.site_key_tail },
    { header: "allowed_origins", value: (b) => b.allowed_origins.join(" ") },
    { header: "model", value: (b) => [b.model_provider, b.model_id].filter(Boolean).join("/") },
    { header: "widget_seen_at", value: (b) => b.widget_seen_at },
    { header: "widget_seen_origin", value: (b) => b.widget_seen_origin },
    { header: "today_tokens", value: (b) => Number(b.today_tokens) },
    { header: "knowledge_version", value: (b) => b.knowledge_version },
    { header: "status", value: (b) => b.status },
    { header: "budget_override", value: (b) => b.budget_override },
    { header: "created_at", value: (b) => b.created_at },
  ],
})
