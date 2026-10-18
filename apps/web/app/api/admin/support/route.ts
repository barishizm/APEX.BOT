import { ADMIN_TICKETS_LIST, type AdminTicketRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The support queue (/admin/support); see lib/admin-list.ts for the query string
export const GET = adminListRoute<AdminTicketRow>({
  name: "support_tickets",
  spec: ADMIN_TICKETS_LIST,
  csv: [
    { header: "number", value: (t) => t.number },
    { header: "subject", value: (t) => t.subject },
    { header: "category", value: (t) => t.category },
    { header: "priority", value: (t) => t.priority },
    { header: "status", value: (t) => t.status },
    { header: "workspace", value: (t) => t.organization_name },
    { header: "site", value: (t) => t.bot_name },
    { header: "customer_email", value: (t) => t.user_email },
    { header: "assignee", value: (t) => t.assignee_name },
    { header: "messages", value: (t) => t.messages },
    { header: "sla_due_at", value: (t) => t.sla_due_at },
    { header: "created_at", value: (t) => t.created_at },
    { header: "updated_at", value: (t) => t.updated_at },
  ],
})
