// Conversation storage. Every call is scoped by tenant id, so one tenant can never read
// another tenant's conversation even with a leaked conversation id.
// shortcut: in-memory until the Postgres schema exists; data is lost on restart.
import { randomUUID } from "node:crypto";

export interface Source {
  url: string;
  title: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  sources?: Source[];
  /** Assistant turn produced without any relevant content (feeds the "unanswered questions" report). */
  unanswered?: boolean;
  feedback?: "up" | "down";
}

export interface Conversation {
  id: string;
  tenantId: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  handoffSent?: boolean;
}

export class ConversationStore {
  private items = new Map<string, Conversation>();

  constructor(private now: () => number = Date.now) {}

  private key(tenantId: string, id: string): string {
    if (!tenantId) throw new Error("tenantId is required");
    return `${tenantId}\u0000${id}`;
  }

  create(tenantId: string): Conversation {
    const at = this.now();
    const conversation: Conversation = { id: randomUUID(), tenantId, createdAt: at, updatedAt: at, messages: [] };
    this.items.set(this.key(tenantId, conversation.id), conversation);
    return conversation;
  }

  get(tenantId: string, id: string): Conversation | undefined {
    return this.items.get(this.key(tenantId, id));
  }

  append(conversation: Conversation, message: Omit<StoredMessage, "id" | "createdAt">): StoredMessage {
    const stored: StoredMessage = { ...message, id: randomUUID(), createdAt: this.now() };
    conversation.messages.push(stored);
    conversation.updatedAt = stored.createdAt;
    return stored;
  }

  setFeedback(tenantId: string, conversationId: string, messageId: string, rating: "up" | "down"): boolean {
    const message = this.get(tenantId, conversationId)?.messages.find((m) => m.id === messageId);
    if (!message || message.role !== "assistant") return false;
    message.feedback = rating;
    return true;
  }

  delete(tenantId: string, id: string): boolean {
    return this.items.delete(this.key(tenantId, id));
  }

  /** Drops conversations idle for longer than their tenant's retention period. */
  sweep(retentionDays: (tenantId: string) => number): number {
    let removed = 0;
    const at = this.now();
    for (const [key, c] of this.items) {
      if (at - c.updatedAt > retentionDays(c.tenantId) * 86_400_000) {
        this.items.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
