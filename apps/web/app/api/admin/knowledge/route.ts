import { ADMIN_KNOWLEDGE_LIST, type AdminKnowledgeRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The admin knowledge source list; see lib/admin-list.ts for the query string
export const GET = adminListRoute<AdminKnowledgeRow>({
  name: "knowledge",
  spec: ADMIN_KNOWLEDGE_LIST,
  csv: [
    { header: "id", value: (s) => s.id },
    { header: "kind", value: (s) => s.kind },
    { header: "title", value: (s) => s.title },
    { header: "url", value: (s) => s.url },
    { header: "status", value: (s) => (s.stuck ? "stuck" : s.status) },
    { header: "error", value: (s) => s.error },
    { header: "pages", value: (s) => s.pages },
    { header: "chunks", value: (s) => s.chunks },
    { header: "refresh", value: (s) => (s.kind === "website" ? s.refresh : "") },
    { header: "at_crawl_ceiling", value: (s) => s.at_ceiling },
    { header: "synced_at", value: (s) => s.synced_at },
    { header: "updated_at", value: (s) => s.updated_at },
    { header: "created_at", value: (s) => s.created_at },
    { header: "bot_id", value: (s) => s.bot_id },
    { header: "bot", value: (s) => s.bot_name },
    { header: "workspace_id", value: (s) => s.organization_id },
    { header: "workspace", value: (s) => s.organization_name },
  ],
})
