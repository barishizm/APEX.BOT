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

/** Where daily token counts are kept across restarts (Postgres); optional, memory alone is the fallback. */
export interface TokenUsageStore {
  load(tenantId: string, day: string): Promise<number>;
  add(tenantId: string, day: string, tokens: number): Promise<void>;
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

  record(tenantId: string, tokens: number): void {
    this.used.set(tenantId, { day: this.today(), tokens: this.usedToday(tenantId) + tokens });
    this.store?.add(tenantId, this.today(), tokens).catch(this.onError);
  }
}
