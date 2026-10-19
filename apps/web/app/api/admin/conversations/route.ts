import { adminConversationBotsList, parseOverviewRange, type AdminConversationBotRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// Each bot's conversation numbers over ?days= (7, 30 or 90; see lib/admin-list.ts for the rest of
// the query string). Counts only: no message, preview or visitor detail ever leaves this route.
export const GET = adminListRoute<AdminConversationBotRow>({
  name: "conversations",
  spec: (search) => adminConversationBotsList(search.get("days")),
  context: (search) => ({ days: parseOverviewRange(search.get("days")) }),
  csv: [
    { header: "bot_id", value: (b) => b.id },
    { header: "bot", value: (b) => b.name },
    { header: "workspace_id", value: (b) => b.organization_id },
    { header: "workspace", value: (b) => b.organization_name },
    { header: "status", value: (b) => b.status },
    { header: "days", value: (b) => b.days },
    { header: "conversations", value: (b) => b.conversations },
    { header: "messages", value: (b) => b.messages },
    { header: "replies", value: (b) => b.answers },
    { header: "unanswered", value: (b) => b.unanswered },
    { header: "unanswered_open", value: (b) => b.open_questions },
    { header: "needs_knowledge", value: (b) => b.needs_knowledge },
    { header: "feedback_down", value: (b) => b.negative },
    { header: "feedback_up", value: (b) => b.positive },
    { header: "handoffs", value: (b) => b.handoffs },
    { header: "leads", value: (b) => b.leads },
    { header: "last_conversation_at", value: (b) => b.last_at },
  ],
})
