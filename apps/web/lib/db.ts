import { createDbFromEnv, type Db } from "@apex/db"

// One pool per server process; kept on globalThis so dev hot reloads don't leak pools.
const g = globalThis as typeof globalThis & { apexDb?: Db }

export function db(): Db {
  return (g.apexDb ??= createDbFromEnv())
}
