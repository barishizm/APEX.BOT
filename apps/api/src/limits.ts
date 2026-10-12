// Abuse and cost guards: fixed-window rate limits and a daily token budget per tenant.
// shortcut: in-process counters; move to Redis once the API runs on more than one instance.

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Counts one hit; returns the seconds to wait when the key is over its limit. */
  hit(key: string): { ok: true } | { ok: false; retryAfter: number } {
    const at = this.now();
    let w = this.windows.get(key);
    if (!w || at - w.start >= this.windowMs) {
      w = { start: at, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 50_000) this.prune(at);
    }
    if (w.count >= this.limit) return { ok: false, retryAfter: Math.ceil((w.start + this.windowMs - at) / 1000) };
    w.count++;
    return { ok: true };
  }

  private prune(at: number): void {
    for (const [key, w] of this.windows) if (at - w.start >= this.windowMs) this.windows.delete(key);
  }
}

export class TokenBudget {
  private used = new Map<string, { day: string; tokens: number }>();

  constructor(private now: () => number = Date.now) {}

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  usedToday(tenantId: string): number {
    const entry = this.used.get(tenantId);
    return entry && entry.day === this.today() ? entry.tokens : 0;
  }

  record(tenantId: string, tokens: number): void {
    this.used.set(tenantId, { day: this.today(), tokens: this.usedToday(tenantId) + tokens });
  }
}
