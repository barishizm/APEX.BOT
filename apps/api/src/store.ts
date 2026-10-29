// Conversation storage. Every call is scoped by tenant id, so one tenant can never read
// another tenant's conversation even with a leaked conversation id.
// Memory is the working copy; for dashboard bots a persistence layer (Postgres) keeps the
// durable copy. Writes go out in order per conversation and never block a reply; a
// conversation missing from memory (after a restart) is loaded back on demand.
import { randomUUID } from "node:crypto";
import type { VisitorContext } from "./visitor-context.ts";

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
  /** Page origin the widget ran on. */
  origin?: string;
  /** Page, language, country and device the conversation started from. */
  context?: VisitorContext;
  handoffSent?: boolean;
  /** Contact details from the widget's lead form. */
  visitor?: { email: string; name?: string; phone?: string };
}

export interface ConversationPersistence {
  created(c: Conversation): Promise<void>;
  appended(c: Conversation, m: StoredMessage): Promise<void>;
  visitor(c: Conversation): Promise<void>;
  handoff(c: Conversation): Promise<void>;
  feedback(c: Conversation, m: StoredMessage): Promise<void>;
  /** Resolves to whether a stored conversation was deleted. */
  deleted(tenantId: string, id: string): Promise<boolean>;
  load(tenantId: string, id: string): Promise<Conversation | undefined>;
}

export interface StoreOptions {
  now?: () => number;
  persistence?: ConversationPersistence;
  /** Which tenants are persisted (dashboard bots); JSON-file tenants stay in memory. */
  persists?: (tenantId: string) => boolean;
  onError?: (error: unknown, conversationId: string) => void;
  /** Most conversations held in memory at once; past it the oldest go (persisted ones reload on demand). */
  maxInMemory?: number;
}

const DEFAULT_MAX_IN_MEMORY = 50_000;

export class ConversationStore {
  private items = new Map<string, Conversation>();
  private chains = new Map<string, Promise<void>>();
  private now: () => number;

  constructor(private options: StoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  private key(tenantId: string, id: string): string {
    if (!tenantId) throw new Error("tenantId is required");
    return `${tenantId}\u0000${id}`;
  }

  private persisted(tenantId: string): ConversationPersistence | undefined {
    const p = this.options.persistence;
    return p && (this.options.persists?.(tenantId) ?? true) ? p : undefined;
  }

  /** Runs persistence writes for one conversation strictly in order, off the request path. */
  private write(c: Conversation, task: (p: ConversationPersistence) => Promise<unknown>): void {
    const p = this.persisted(c.tenantId);
    if (!p) return;
    const prev = this.chains.get(c.id) ?? Promise.resolve();
    const next = prev
      .then(() => task(p))
      .then(
        () => undefined,
        (error) => this.options.onError?.(error, c.id),
      );
    this.chains.set(c.id, next);
    void next.then(() => {
      if (this.chains.get(c.id) === next) this.chains.delete(c.id);
    });
  }

  /** Resolves once every queued write has finished (tests, shutdown). */
  async flush(): Promise<void> {
    while (this.chains.size) await Promise.all([...this.chains.values()]);
  }

  create(tenantId: string, origin?: string, context?: VisitorContext): Conversation {
    const at = this.now();
    const conversation: Conversation = {
      id: randomUUID(),
      tenantId,
      createdAt: at,
      updatedAt: at,
      messages: [],
      ...(origin ? { origin } : {}),
      ...(context && Object.keys(context).length ? { context } : {}),
    };
    this.makeRoom();
    this.items.set(this.key(tenantId, conversation.id), conversation);
    this.write(conversation, (p) => p.created(conversation));
    return conversation;
  }

  // Anonymous callers can start conversations faster than retention sweeps them, so memory has a ceiling:
  // the oldest entries (Map order is insertion order) make room. Persisted ones come back via getOrLoad.
  private makeRoom(): void {
    const max = this.options.maxInMemory ?? DEFAULT_MAX_IN_MEMORY;
    for (const key of this.items.keys()) {
      if (this.items.size < max) break;
      this.items.delete(key);
    }
  }

  /** In memory only. */
  get(tenantId: string, id: string): Conversation | undefined {
    return this.items.get(this.key(tenantId, id));
  }

  /** From memory, or from persistence after a restart. */
  async getOrLoad(tenantId: string, id: string): Promise<Conversation | undefined> {
    const hit = this.get(tenantId, id);
    if (hit) return hit;
    const p = this.persisted(tenantId);
    if (!p) return undefined;
    const loaded = await p.load(tenantId, id);
    if (!loaded || loaded.tenantId !== tenantId) return undefined;
    // another request may have loaded it meanwhile
    const again = this.get(tenantId, id);
    if (again) return again;
    this.makeRoom();
    this.items.set(this.key(tenantId, id), loaded);
    return loaded;
  }

  append(conversation: Conversation, message: Omit<StoredMessage, "id" | "createdAt">): StoredMessage {
    const stored: StoredMessage = { ...message, id: randomUUID(), createdAt: this.now() };
    conversation.messages.push(stored);
    conversation.updatedAt = stored.createdAt;
    this.write(conversation, (p) => p.appended(conversation, stored));
    return stored;
  }

  setVisitor(conversation: Conversation, visitor: NonNullable<Conversation["visitor"]>): void {
    conversation.visitor = visitor;
    this.write(conversation, (p) => p.visitor(conversation));
  }

  markHandoff(conversation: Conversation): void {
    conversation.handoffSent = true;
    this.write(conversation, (p) => p.handoff(conversation));
  }

  setFeedback(conversation: Conversation, messageId: string, rating: "up" | "down"): boolean {
    const message = conversation.messages.find((m) => m.id === messageId);
    if (!message || message.role !== "assistant") return false;
    message.feedback = rating;
    this.write(conversation, (p) => p.feedback(conversation, message));
    return true;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const inMemory = this.items.delete(this.key(tenantId, id));
    const p = this.persisted(tenantId);
    if (!p) return inMemory;
    // wait for queued writes, or the delete could run before the insert it should remove
    await this.chains.get(id);
    return (await p.deleted(tenantId, id)) || inMemory;
  }

  /** Drops conversations idle for longer than their tenant's retention period (memory only). */
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
