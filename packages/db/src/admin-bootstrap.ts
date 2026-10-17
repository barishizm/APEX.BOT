import { createDbFromEnv } from "./db.ts"
import { AdminError, bootstrapSuperadmin } from "./admin.ts"

// One-time: makes an existing account the first superadmin.
//   npm run admin:bootstrap -- you@example.com
//   ADMIN_BOOTSTRAP_EMAIL=you@example.com npm run admin:bootstrap
// Running it again is harmless; once a superadmin exists no other account can be made one here.
const email = process.argv[2] || process.env.ADMIN_BOOTSTRAP_EMAIL
if (!email) {
  console.error("Give the account's email: npm run admin:bootstrap -- you@example.com (or set ADMIN_BOOTSTRAP_EMAIL)")
  process.exitCode = 1
} else {
  const db = createDbFromEnv()
  try {
    const { userId, created } = await bootstrapSuperadmin(db, email)
    console.log(created ? `Superadmin set: ${userId}` : `Already the superadmin: ${userId}`)
  } catch (err) {
    console.error("Bootstrap failed:", err instanceof AdminError || err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await db.close()
  }
}
