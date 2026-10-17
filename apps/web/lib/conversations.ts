import type { ConversationFilter, ConversationSummary, StoredConversation } from "@apex/db"

// Labels live in the inbox dictionary (lib/i18n/app/inbox.ts)
export const FILTERS: ConversationFilter[] = ["all", "unanswered", "handoff", "leads", "negative"]

export const parseFilter = (raw: string | null | undefined): ConversationFilter =>
  FILTERS.includes(raw as ConversationFilter) ? (raw as ConversationFilter) : "all"

// ?days= from a stats card: a whole number of days up to a year, anything else means all time
export const parseDays = (raw: string | null | undefined): number | null => {
  const n = Number(raw)
  return raw && Number.isInteger(n) && n >= 1 && n <= 365 ? n : null
}

// ?q= from the inbox search box
export const parseSearch = (raw: string | null | undefined): string | null => raw?.trim().slice(0, 200) || null

/** Inbox link that keeps a filter, period and search; parts left out are dropped from the address. */
export function conversationsHref(filter: ConversationFilter, days?: number | null, search?: string | null) {
  const params = new URLSearchParams()
  if (filter !== "all") params.set("filter", filter)
  if (days) params.set("days", String(days))
  if (search) params.set("q", search)
  const query = params.toString()
  return query ? `/dashboard/conversations?${query}` : "/dashboard/conversations"
}

export function summaryJson(c: ConversationSummary) {
  return { ...c, handoffAt: c.handoffAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }
}
export type SummaryJson = ReturnType<typeof summaryJson>

export function conversationJson(c: StoredConversation) {
  return {
    id: c.id,
    origin: c.origin,
    context: c.context,
    visitor: c.visitor,
    handoffAt: c.handoffAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  }
}
export type ConversationJson = ReturnType<typeof conversationJson>
