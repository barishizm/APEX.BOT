import type { Queryable } from "./db.ts"

/** Mail to customer-chosen addresses that a daily cap counts (see migration 0040). */
export type MailSendKind = "invite" | "handoff_code"

/**
 * Logs one send for the scope's daily cap, and drops that scope's entries older than any cap looks back.
 * Pruning only the caller's own rows keeps it on the (kind, scope, created_at) index and off other workspaces' rows.
 */
export async function recordMailSend(q: Queryable, kind: MailSendKind, scope: string): Promise<void> {
  await q.query(
    `with pruned as (delete from app.mail_sends where kind = $1 and scope = $2 and created_at < now() - interval '3 days')
     insert into app.mail_sends (kind, scope) values ($1, $2)`,
    [kind, scope],
  )
}
