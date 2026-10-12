import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { createDbFromEnv, type Db } from "./db.ts"

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url))

// Applies every migrations/*.sql not yet recorded, in filename order, each in its
// own transaction. Safe to run concurrently: the advisory lock serializes runners.
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()
  await db.query("create schema if not exists app")
  await db.query(
    "create table if not exists app.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  )
  await db.query("alter table app.schema_migrations enable row level security")

  const applied: string[] = []
  for (const name of files) {
    const sql = await readFile(path.join(dir, name), "utf8")
    const ran = await db.transaction(async (tx) => {
      await tx.query("select pg_advisory_xact_lock(hashtext('apex.schema_migrations'))")
      const { rows } = await tx.query("select 1 from app.schema_migrations where name = $1", [name])
      if (rows.length) return false
      await tx.query(sql)
      await tx.query("insert into app.schema_migrations (name) values ($1)", [name])
      return true
    })
    if (ran) applied.push(name)
  }
  return applied
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = createDbFromEnv()
  try {
    const applied = await migrate(db)
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.")
  } catch (err) {
    console.error("Migration failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await db.close()
  }
}
