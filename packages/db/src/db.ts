import pg from "pg"

// The only surface the rest of the code uses, so the driver (pg today; PGlite in
// tests) and the host (Supabase today, a self-hosted server later) stay swappable.
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** A Db whose queries and transactions all run in `tx`, for functions that take a Db but must join the caller's transaction. */
export const inTransaction = (tx: Queryable): Db => ({
  query: (text, params) => tx.query(text, params),
  transaction: (fn) => fn(tx),
  close: async () => {},
})

export interface DbOptions {
  // "require": encrypt without verifying the server certificate (Supabase poolers
  // present a chain Node doesn't trust by default); "verify": also verify, against
  // caCert when given; "off": plain TCP, for a local server.
  ssl?: "off" | "require" | "verify"
  caCert?: string
  max?: number
}

export function sslModeFor(url: string): "off" | "require" {
  const host = new URL(url).hostname
  return host === "localhost" || host === "127.0.0.1" || host === "::1" ? "off" : "require"
}

export function createDb(url: string, options: DbOptions = {}): Db {
  const mode = options.ssl ?? sslModeFor(url)
  // sslmode in the URL would override the ssl option below, so it is controlled
  // only through DATABASE_SSL.
  const parsed = new URL(url)
  parsed.searchParams.delete("sslmode")
  const pool = new pg.Pool({
    connectionString: parsed.toString(),
    max: options.max ?? 5,
    ssl:
      mode === "off"
        ? false
        : mode === "require"
          ? { rejectUnauthorized: false }
          : { rejectUnauthorized: true, ca: options.caCert },
  })
  // An idle client losing its connection (pooler restart) must not crash the process
  pool.on("error", (err) => console.error("[db] idle client error:", err.message))

  return {
    query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await pool.query(text, params)).rows as T[] }),
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query("begin")
        const result = await fn({
          query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await client.query(text, params)).rows as T[] }),
        })
        await client.query("commit")
        return result
      } catch (err) {
        await client.query("rollback").catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

// Reads DATABASE_URL / DATABASE_SSL / DATABASE_CA_CERT (PEM text) / DATABASE_POOL_MAX from the environment.
export function createDbFromEnv(env: NodeJS.ProcessEnv = process.env): Db {
  const url = env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const ssl = env.DATABASE_SSL || undefined
  if (ssl !== undefined && ssl !== "off" && ssl !== "require" && ssl !== "verify") {
    throw new Error(`DATABASE_SSL must be off, require or verify (got "${ssl}")`)
  }
  // 1 against the local PGlite server (npm run db:local), which runs every connection in one session
  const max = env.DATABASE_POOL_MAX ? Number(env.DATABASE_POOL_MAX) : undefined
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) throw new Error(`DATABASE_POOL_MAX must be a positive integer (got "${env.DATABASE_POOL_MAX}")`)
  return createDb(url, { ssl, caCert: env.DATABASE_CA_CERT || undefined, max })
}
