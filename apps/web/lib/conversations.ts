import type { ConversationFilter, ConversationSummary, StoredConversation } from "@apex/db"

export const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unanswered", label: "Unanswered" },
  { id: "handoff", label: "Hand-offs" },
  { id: "leads", label: "Leads" },
  { id: "negative", label: "Thumbs down" },
]

export const parseFilter = (raw: string | null | undefined): ConversationFilter =>
  FILTERS.some((f) => f.id === raw) ? (raw as ConversationFilter) : "all"

export function summaryJson(c: ConversationSummary) {
  return { ...c, handoffAt: c.handoffAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }
}
export type SummaryJson = ReturnType<typeof summaryJson>

export function conversationJson(c: StoredConversation) {
  return {
    id: c.id,
    origin: c.origin,
    visitor: c.visitor,
    handoffAt: c.handoffAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  }
}
export type ConversationJson = ReturnType<typeof conversationJson>
