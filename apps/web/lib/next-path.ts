import { billingNextPath } from "./billing/intent.ts"

// Where signing in or up may return to (`?next=`), shared by the server routes and the auth modal.
// Only two kinds of page, each rebuilt or matched exactly, so `next` can't send anyone off-site.

const INVITE_PATH = /^\/invite\/([A-Za-z0-9_-]{20,100})$/

/** An invitation link, or the billing page with the plan picked on the pricing page; else null. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  return INVITE_PATH.test(raw) ? raw : billingNextPath(raw)
}

/** The invitation token in a `next` path, if it is one. */
export function inviteTokenFromPath(next: unknown): string | null {
  return typeof next === "string" ? (INVITE_PATH.exec(next)?.[1] ?? null) : null
}
