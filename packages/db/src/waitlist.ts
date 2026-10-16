import type { Db } from "./db.ts"
import { AuthError } from "./auth.ts"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Adds an email to the waitlist. Joining twice is fine, so the caller can't tell who is already on it. */
export async function joinWaitlist(db: Db, rawEmail: unknown, locale: string = "en"): Promise<void> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError("invalid_input", "Enter a valid email address")
  await db.query("insert into app.waitlist (email, locale) values ($1, $2) on conflict (email) do nothing", [email, locale.slice(0, 8)])
}
