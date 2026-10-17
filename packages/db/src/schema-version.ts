import type { Queryable } from "./db.ts"

// Every file in migrations/, in order. A test checks this matches the folder, so the apps
// can tell whether the database is up to date without reading the filesystem.
export const MIGRATION_NAMES = [
  "0001_auth.sql",
  "0002_function_search_path.sql",
  "0003_bots.sql",
  "0004_knowledge.sql",
  "0005_bot_activity.sql",
  "0006_account.sql",
  "0007_conversations.sql",
  "0008_handoff_verification.sql",
  "0009_token_usage.sql",
  "0010_waitlist.sql",
  "0011_analytics.sql",
  "0012_knowledge_embeddings.sql",
  "0013_multi_site.sql",
  "0014_display_name.sql",
  "0015_message_topics.sql",
  "0016_conversation_context.sql",
  "0017_account_security.sql",
  "0018_totp_secret_sealed.sql",
] as const

/** Migrations this code expects that the database hasn't applied (run `npm run db:migrate`). */
export async function missingMigrations(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ exists: boolean }>("select to_regclass('app.schema_migrations') is not null as exists")
  if (!rows[0]?.exists) return [...MIGRATION_NAMES]
  const applied = new Set((await db.query<{ name: string }>("select name from app.schema_migrations")).rows.map((r) => r.name))
  return MIGRATION_NAMES.filter((name) => !applied.has(name))
}
