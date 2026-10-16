import { MIGRATION_NAMES, createDbFromEnv, missingMigrations, type Db } from "@apex/db"

// One pool per server process; kept on globalThis so dev hot reloads don't leak pools.
const g = globalThis as typeof globalThis & { apexDb?: Db; apexSchema?: { checkedAt: number; missing: string[]; expected: string } }

export function db(): Db {
  return (g.apexDb ??= createDbFromEnv())
}

/**
 * Migrations the database still needs. An up-to-date result is remembered for the life of
 * the process; a behind one is re-checked every few seconds, so running the migration fixes
 * the app without a restart.
 */
export async function schemaMissing(): Promise<string[]> {
  // the cache survives dev hot reloads, so a reload that brings a new migration must re-check
  const expected = MIGRATION_NAMES.join()
  const cached = g.apexSchema
  if (cached && cached.expected === expected && (cached.missing.length === 0 || Date.now() - cached.checkedAt < 5000)) return cached.missing
  const missing = await missingMigrations(db())
  g.apexSchema = { checkedAt: Date.now(), missing, expected }
  return missing
}
