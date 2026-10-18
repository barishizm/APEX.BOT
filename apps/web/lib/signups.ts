import { AuthError, isSignupsMode, platformSettings, readPlatformSettings, signupAllowed, type Queryable, type SignupsMode, type User } from "@apex/db"
import { db } from "@/lib/db"

// Who may create an account is set at runtime in /admin/settings (platform_settings.signups_mode):
//
//   open         everyone
//   invite_only  people staff invited from the waitlist, and people invited to a workspace
//   closed       only people invited to a workspace; the sign-up form becomes the waitlist
//
// SIGNUPS_MODE in the environment is only the default, for a database where staff never chose.
// Existing accounts can always log in. The register route, Google/GitHub sign-up and the auth modal
// (through /api/auth/signups) all read the mode here, on the server.

export const DEFAULT_SIGNUPS_MODE: SignupsMode = isSignupsMode(process.env.SIGNUPS_MODE) ? process.env.SIGNUPS_MODE : "open"

/** The mode now (cached for up to 30 seconds); the default when the database can't be read. */
export async function currentSignupsMode(): Promise<SignupsMode> {
  try {
    return (await platformSettings(db())).signupsMode ?? DEFAULT_SIGNUPS_MODE
  } catch (err) {
    console.error("[signups] couldn't read the sign-up mode; using the default", err instanceof Error ? err.message : err)
    return DEFAULT_SIGNUPS_MODE
  }
}

/** The mode as stored now, read in the caller's transaction (no cache). */
export async function signupsModeIn(tx: Queryable): Promise<SignupsMode> {
  return (await readPlatformSettings(tx)).signupsMode ?? DEFAULT_SIGNUPS_MODE
}

/** Whether a new account may be created for this email now. */
export async function mayCreateAccount(input: { email: unknown; inviteToken?: unknown }): Promise<boolean> {
  return signupAllowed(db(), await currentSignupsMode(), input)
}

async function refuseSignup(): Promise<never> {
  throw (await currentSignupsMode()) === "invite_only"
    ? new AuthError("signups_closed", "Sign-ups are invite-only for now. Join the waitlist and we'll email you an invitation")
    : new AuthError("signups_closed", "Sign-ups are closed for now. Join the waitlist")
}

/** For the register route: refuses an address the sign-up mode doesn't let in. */
export async function assertMayCreateAccount(input: { email: unknown; inviteToken?: unknown }) {
  if (!(await mayCreateAccount(input))) await refuseSignup()
}

/**
 * An account that hasn't verified its address yet may only move to one that could sign up itself:
 * otherwise registering with an invited address and changing it would open invite-only or closed
 * sign-ups to anyone, again and again. A verified account was let in already and may change freely.
 */
export async function assertMayTakeAddress(user: Pick<User, "email" | "emailVerified">, email: unknown) {
  if (user.emailVerified || typeof email !== "string" || !email.trim() || email.trim().toLowerCase() === user.email) return
  await assertMayCreateAccount({ email })
}
