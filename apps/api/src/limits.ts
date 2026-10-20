// Abuse and cost guards: fixed-window rate limits and a daily token budget per tenant.
// shortcut: in-process counters; move to Redis once the API runs on more than one instance.

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Counts one hit; returns the seconds to wait when the key is over its limit (or `limit`, per call). */
  hit(key: string, limit = this.limit): { ok: true } | { ok: false; retryAfter: number } {
    const at = this.now();
    let w = this.windows.get(key);
    if (!w || at - w.start >= this.windowMs) {
      w = { start: at, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 50_000) this.prune(at);
    }
    if (w.count >= limit) return { ok: false, retryAfter: Math.ceil((w.start + this.windowMs - at) / 1000) };
    w.count++;
    return { ok: true };
  }

  private prune(at: number): void {
    for (const [key, w] of this.windows) if (at - w.start >= this.windowMs) this.windows.delete(key);
  }
}

/** One model call's tokens; the budget counts both, the admin usage page prices them separately. */
export interface TokenCount {
  input: number;
  output: number;
}

/** Where daily token counts are kept across restarts (Postgres); optional, memory alone is the fallback. */
export interface TokenUsageStore {
  load(tenantId: string, day: string): Promise<number>;
  add(tenantId: string, day: string, usage: TokenCount): Promise<void>;
}

export class TokenBudget {
  private used = new Map<string, { day: string; tokens: number }>();
  private loaded = new Set<string>();

  constructor(
    private now: () => number = Date.now,
    private store?: TokenUsageStore,
    private onError: (error: unknown) => void = () => {},
  ) {}

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  /** Pulls today's persisted count into memory, once per tenant per day (call before `usedToday`). */
  async load(tenantId: string): Promise<void> {
    const day = this.today();
    const key = `${tenantId}:${day}`;
    if (!this.store || this.loaded.has(key)) return;
    try {
      const persisted = await this.store.load(tenantId, day);
      this.loaded.add(key);
      // keep whatever was counted here while the read was in flight
      const local = this.usedToday(tenantId);
      this.used.set(tenantId, { day, tokens: Math.max(persisted, local) });
    } catch (error) {
      this.onError(error); // fail open on the persisted count; the in-memory one still applies
    }
    if (this.loaded.size > 10_000) for (const k of this.loaded) if (!k.endsWith(day)) this.loaded.delete(k);
  }

  usedToday(tenantId: string): number {
    const entry = this.used.get(tenantId);
    return entry && entry.day === this.today() ? entry.tokens : 0;
  }

  record(tenantId: string, usage: TokenCount): void {
    this.used.set(tenantId, { day: this.today(), tokens: this.usedToday(tenantId) + usage.input + usage.output });
    this.store?.add(tenantId, this.today(), usage).catch(this.onError);
  }
}

/** Past a window's allowance under overage: what addReplyUsage stores as the window's overage. */
export interface OverageLimit {
  allowanceFifths: number;
  capFifths: number;
}

/**
 * Where monthly AI reply counts live (Postgres, app.reply_usage). Shared by every API instance:
 * `add` is one atomic upsert and returns the window's new total, in fifths of a reply.
 */
export interface ReplyUsageStore {
  load(organizationId: string, periodStart: Date): Promise<number>;
  add(organizationId: string, periodStart: Date, fifths: number, overage?: OverageLimit): Promise<number>;
}

/**
 * A workspace's AI replies in its current monthly window (docs/adr/0003-billing.md (b)), in fifths.
 * The store holds the count; the one here is a cache of it, re-read when it is older than
 * `refreshMs` or within `nearFifths` of the limit, so replies other instances counted are seen in
 * time. What can still slip past the limit is the replies already in flight when it is reached.
 */
export class ReplyQuota {
  /** `base`: the store's total as last seen; `pending`: counted here, not yet confirmed by the store. */
  private used = new Map<string, { period: number; base: number; pending: number; checkedAt: number }>();

  constructor(
    private now: () => number = Date.now,
    private store?: ReplyUsageStore,
    private onError: (error: unknown) => void = () => {},
    private refreshMs = 15_000,
    private nearFifths = 50,
  ) {}

  private entry(organizationId: string, periodStart: Date) {
    const entry = this.used.get(organizationId);
    if (entry && entry.period === periodStart.getTime()) return entry;
    const fresh = { period: periodStart.getTime(), base: 0, pending: 0, checkedAt: -Infinity };
    this.used.set(organizationId, fresh);
    if (this.used.size > 50_000) for (const [id, e] of this.used) if (e.period !== fresh.period) this.used.delete(id);
    return fresh;
  }

  /** Brings the cached count up to date when it may be stale (call before `usedIn`). */
  async load(organizationId: string, periodStart: Date, limitFifths: number): Promise<void> {
    if (!this.store) return;
    const entry = this.entry(organizationId, periodStart);
    const at = this.now();
    if (at - entry.checkedAt < this.refreshMs && limitFifths - (entry.base + entry.pending) > this.nearFifths) return;
    try {
      const persisted = await this.store.load(organizationId, periodStart);
      entry.base = Math.max(entry.base, persisted);
      entry.checkedAt = at;
    } catch (error) {
      this.onError(error); // fail open on the persisted count; the cached one still applies
    }
  }

  usedIn(organizationId: string, periodStart: Date): number {
    const entry = this.used.get(organizationId);
    return entry && entry.period === periodStart.getTime() ? entry.base + entry.pending : 0;
  }

  /** Counts one delivered answer of `fifths` against the window. */
  record(organizationId: string, periodStart: Date, fifths: number, overage?: OverageLimit): void {
    const entry = this.entry(organizationId, periodStart);
    if (!this.store) {
      entry.base += fifths;
      return;
    }
    entry.pending += fifths;
    this.store.add(organizationId, periodStart, fifths, overage).then(
      (total) => {
        entry.pending -= fifths;
        entry.base = Math.max(entry.base, total);
      },
      (error) => {
        // not stored: keep counting it here so this instance still holds the line
        entry.pending -= fifths;
        entry.base += fifths;
        this.onError(error);
      },
    );
  }
}
