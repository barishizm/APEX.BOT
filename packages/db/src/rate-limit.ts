import type { Queryable } from "./db.ts"

export interface RateLimit {
  /** Requests allowed per window. */
  max: number
  windowSeconds: number
}

/**
 * Counts one request against `key` in a fixed window, in the database so the limit holds across
 * serverless instances. Returns how long to wait when the limit is used up, else null.
 */
export async function hitRateLimit(q: Queryable, key: string, limit: RateLimit): Promise<{ retryAfterSeconds: number } | null> {
  const { rows } = await q.query<{ hits: number; retry_after: number }>(
    `with w as (select to_timestamp(floor(extract(epoch from now()) / $2) * $2) as start)
     insert into app.rate_limits as r (key, window_start) select $1, start from w
     on conflict (key, window_start) do update set hits = r.hits + 1
     returning r.hits, ceil(extract(epoch from (r.window_start + make_interval(secs => $2) - now())))::int as retry_after`,
    [key.slice(0, 200), limit.windowSeconds],
  )
  // a key keeps only its current window
  await q.query("delete from app.rate_limits where key = $1 and window_start < now() - make_interval(secs => $2)", [
    key.slice(0, 200),
    limit.windowSeconds,
  ])
  const row = rows[0]!
  return row.hits > limit.max ? { retryAfterSeconds: Math.max(1, row.retry_after) } : null
}
