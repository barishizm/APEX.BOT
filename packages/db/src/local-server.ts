import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

// Local development only: a Postgres server (PGlite, in-process) for apps/web and apps/api, with
// no Postgres install. The data stays in packages/db/.pglite (git-ignored) between runs.
//   npm run db:local            then, in apps/web/.env.local and apps/api/.env:
//   DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres
//   DATABASE_SSL=off
//   DATABASE_POOL_MAX=1         PGlite is one session: more connections would mix transactions
// Then npm run db:migrate. Delete the folder for an empty database.
const port = Number(process.env.PGLITE_PORT || 5433)
const dir = resolve(import.meta.dirname, "..", process.env.PGLITE_DIR || ".pglite")
mkdirSync(dir, { recursive: true })

const db = await PGlite.create(dir)
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 8 })
await server.start()
console.log(`PGlite on postgresql://postgres@127.0.0.1:${port}/postgres (data: ${dir})`)

const stop = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
