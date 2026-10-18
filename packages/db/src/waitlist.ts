import type { Db, Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ListSpec } from "./admin-list.ts"
import type { ActionChange } from "./admin-users.ts"
import { AuthError, normalizeEmail } from "./auth.ts"
import type { SignupsMode } from "./platform-settings.ts"
import { invitationAllowsSignup } from "./team.ts"

// The waitlist: emails left while sign-ups aren't open to everyone. Staff work it at
// /admin/waitlist and invite people from it; while sign-ups are invite-only, an invited address
// may sign up (signupAllowed).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WAITLIST_LOCALES = ["en", "tr", "lt", "lv", "et"] as const

/** Entries one invite or delete may cover; the invite emails go out one by one. */
export const WAITLIST_BATCH_MAX = 200

/** Adds an email to the waitlist. Joining twice is fine, so the caller can't tell who is already on it. */
export async function joinWaitlist(db: Queryable, rawEmail: unknown, locale: string = "en"): Promise<void> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError("invalid_input", "Enter a valid email address")
  await db.query("insert into app.waitlist (email, locale) values ($1, $2) on conflict (email) do nothing", [email, locale.slice(0, 8)])
}

/** Whether staff invited this address from the waitlist. */
export async function isWaitlistInvited(q: Queryable, rawEmail: unknown): Promise<boolean> {
  let email: string
  try {
    email = normalizeEmail(rawEmail)
  } catch {
    return false
  }
  const { rows } = await q.query("select 1 from app.waitlist where email = $1 and invited_at is not null", [email])
  return rows.length > 0
}

/**
 * Whether a new account may be created for this email under the sign-up mode. An invitation to a
 * workspace lets its address in unless sign-ups are open anyway; invite-only also lets in the
 * addresses staff invited from the waitlist. Existing accounts are not affected: they log in.
 */
export async function signupAllowed(db: Db, mode: SignupsMode, input: { email: unknown; inviteToken?: unknown }): Promise<boolean> {
  if (mode === "open") return true
  if (input.inviteToken && (await invitationAllowsSignup(db, input.inviteToken, input.email))) return true
  return mode === "invite_only" && (await isWaitlistInvited(db, input.email))
}

// ---------- /admin/waitlist ----------

export interface AdminWaitlistRow {
  id: string
  email: string
  locale: string
  created_at: Date
  invited_at: Date | null
  invite_count: number
  /** An account with this email exists (signed up, maybe before joining the list). */
  signed_up: boolean
}

export const ADMIN_WAITLIST_LIST = {
  select: `w.id, w.email, w.locale, w.created_at, w.invited_at, w.invite_count,
    exists (select 1 from app.users u where u.email = w.email) as signed_up`,
  from: "app.waitlist w",
  id: { sql: "w.id", type: "uuid" },
  sorts: {
    created: { sql: "w.created_at", type: "timestamptz" },
    email: { sql: "w.email", type: "text" },
    // never invited go first when ascending
    invited: { sql: "coalesce(w.invited_at, '-infinity')", type: "timestamptz" },
  },
  defaultSort: { key: "created", dir: "desc" },
  search: ["w.email"],
  filters: {
    invited: { yes: "w.invited_at is not null", no: "w.invited_at is null" },
    signed_up: {
      yes: "exists (select 1 from app.users u where u.email = w.email)",
      no: "not exists (select 1 from app.users u where u.email = w.email)",
    },
    locale: {
      en: "w.locale = 'en'",
      tr: "w.locale = 'tr'",
      lt: "w.locale = 'lt'",
      lv: "w.locale = 'lv'",
      et: "w.locale = 'et'",
    },
  },
  valueFilters: {
    since: { sql: "w.created_at >= {}", type: "date" },
  },
} satisfies ListSpec

/** Totals for the page header. */
export async function waitlistCounts(q: Queryable): Promise<{ total: number; invited: number; signedUp: number }> {
  const { rows } = await q.query<{ total: number; invited: number; signed_up: number }>(
    `select count(*)::int as total,
            count(*) filter (where w.invited_at is not null)::int as invited,
            count(*) filter (where exists (select 1 from app.users u where u.email = w.email))::int as signed_up
       from app.waitlist w`,
  )
  const r = rows[0]!
  return { total: r.total, invited: r.invited, signedUp: r.signed_up }
}

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.length) throw new AdminError("invalid_input", "Choose at least one person")
  if (raw.length > WAITLIST_BATCH_MAX) throw new AdminError("invalid_input", "Choose at most 200 people at a time")
  const ids = [...new Set(raw.map((id) => (typeof id === "string" ? id.toLowerCase() : "")))]
  if (ids.some((id) => !UUID_RE.test(id))) throw new AdminError("invalid_input", "Choose at least one person")
  return ids
}

export interface WaitlistInvite {
  email: string
  /** The language they joined in; their email is written in it. */
  locale: (typeof WAITLIST_LOCALES)[number]
}

/**
 * Marks the chosen entries invited and returns who to email. People who already have an account
 * are skipped. Inviting someone again sends the email again.
 */
export async function inviteFromWaitlist(tx: Queryable, actorId: string, rawIds: unknown): Promise<ActionChange<{ invites: WaitlistInvite[]; skipped: number }>> {
  const ids = cleanIds(rawIds)
  const { rows } = await tx.query<{ id: string; email: string; locale: string; previously: Date | null }>(
    `update app.waitlist w
        set invited_at = now(), invited_by = $2, invite_count = w.invite_count + 1
       from app.waitlist old
      where w.id = any($1::uuid[]) and old.id = w.id
        and not exists (select 1 from app.users u where u.email = w.email)
      returning w.id, w.email, w.locale, old.invited_at as previously`,
    [ids, actorId],
  )
  if (!rows.length) throw new AdminError("invalid_input", "Nobody to invite: everyone chosen already has an account")
  const invites = rows.map((r) => ({
    email: r.email,
    locale: (WAITLIST_LOCALES as readonly string[]).includes(r.locale) ? (r.locale as WaitlistInvite["locale"]) : "en",
  }))
  return {
    before: { reinvited: rows.filter((r) => r.previously).length },
    after: { invited: rows.map((r) => r.id), count: rows.length, skipped: ids.length - rows.length },
    extra: { invites, skipped: ids.length - rows.length },
  }
}

/** Deletes the chosen entries; their emails are gone for good. */
export async function deleteFromWaitlist(tx: Queryable, rawIds: unknown): Promise<ActionChange<{ deleted: number }>> {
  const ids = cleanIds(rawIds)
  const { rows } = await tx.query<{ id: string; invited: boolean }>(
    "delete from app.waitlist where id = any($1::uuid[]) returning id, invited_at is not null as invited",
    [ids],
  )
  if (!rows.length) throw new AdminError("not_found", "These people are no longer on the waitlist")
  // the audit entry keeps ids, not the deleted addresses
  return {
    before: { ids: rows.map((r) => r.id), invited: rows.filter((r) => r.invited).length },
    after: { deleted: rows.length },
    extra: { deleted: rows.length },
  }
}
