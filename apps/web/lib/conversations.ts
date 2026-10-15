import type { ConversationFilter, ConversationSummary, StoredConversation } from "@apex/db"

// Labels live in the inbox dictionary (lib/i18n/app/inbox.ts)
export const FILTERS: ConversationFilter[] = ["all", "unanswered", "handoff", "leads", "negative"]

export const parseFilter = (raw: string | null | undefined): ConversationFilter =>
  FILTERS.includes(raw as ConversationFilter) ? (raw as ConversationFilter) : "all"

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
