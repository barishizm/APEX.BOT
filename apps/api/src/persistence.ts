// Durable copy of dashboard bots' conversations in Postgres (see store.ts).
import {
  deleteConversation,
  insertConversation,
  insertMessage,
  loadConversation,
  markConversationHandoff,
  setConversationVisitor,
  setMessageFeedback,
  type Db,
} from "@apex/db";
import type { Conversation, ConversationPersistence } from "./store.ts";
import type { VisitorContext } from "./visitor-context.ts";

/**
 * `context: false` and no `retentionCap` leave those columns out, for a database before migrations
 * 0016 and 0036. `retentionCap` gives the plan's longest retention for a bot (null: no cap).
 */
export function postgresPersistence(db: Db, options: { context?: boolean; retentionCap?: (botId: string) => number | null } = {}): ConversationPersistence {
  const withContext = options.context ?? true;
  return {
    created: (c) =>
      insertConversation(db, {
        id: c.id,
        botId: c.tenantId,
        origin: c.origin ?? null,
        context: withContext ? (c.context ?? {}) : undefined,
        retentionCapDays: options.retentionCap?.(c.tenantId),
        createdAt: new Date(c.createdAt),
      }),
    appended: (c, m) =>
      insertMessage(db, {
        id: m.id,
        conversationId: c.id,
        botId: c.tenantId,
        role: m.role,
        content: m.content,
        sources: m.sources,
        unanswered: m.unanswered,
        createdAt: new Date(m.createdAt),
      }),
    visitor: (c) => (c.visitor ? setConversationVisitor(db, c.tenantId, c.id, c.visitor) : Promise.resolve()),
    handoff: (c) => markConversationHandoff(db, c.tenantId, c.id),
    feedback: (c, m) => (m.feedback ? setMessageFeedback(db, c.tenantId, c.id, m.id, m.feedback) : Promise.resolve()),
    deleted: (tenantId, id) => deleteConversation(db, tenantId, id),
    async load(tenantId, id) {
      const stored = await loadConversation(db, tenantId, id);
      if (!stored) return undefined;
      const conversation: Conversation = {
        id: stored.id,
        tenantId: stored.botId,
        createdAt: stored.createdAt.getTime(),
        updatedAt: stored.updatedAt.getTime(),
        ...(stored.origin ? { origin: stored.origin } : {}),
        // written by visitorContext(), so its fields have that shape
        ...(Object.keys(stored.context).length ? { context: stored.context as VisitorContext } : {}),
        ...(stored.handoffAt ? { handoffSent: true } : {}),
        ...(stored.visitor
          ? { visitor: { email: stored.visitor.email, ...(stored.visitor.name ? { name: stored.visitor.name } : {}), ...(stored.visitor.phone ? { phone: stored.visitor.phone } : {}) } }
          : {}),
        messages: stored.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.getTime(),
          ...(m.sources.length ? { sources: m.sources } : {}),
          ...(m.unanswered ? { unanswered: true } : {}),
          ...(m.feedback ? { feedback: m.feedback } : {}),
        })),
      };
      return conversation;
    },
  };
}
