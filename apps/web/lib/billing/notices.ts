import {
  claimBillingNotice,
  dueBillingNotices,
  dueGraceExpiries,
  expireGrace,
  finishBillingNotice,
  maskPII,
  releaseBillingNotice,
  type BillingNoticeKind,
  type Db,
} from "@apex/db"
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config"
import { sendBillingNotice } from "@/lib/mail"
import { siteUrl } from "@/lib/site"

// Billing emails and the end of grace (docs/adr/0003-billing.md (c), (f)), run daily by
// /api/cron/billing-notices and, for one workspace, right after a webhook changed its billing. A run
// first moves every workspace whose grace ran out to Free (expireGrace), then sends what
// dueBillingNotices finds: each notice is claimed before its mail goes out and given back when none
// did, so it goes out once per workspace, kind and period however many runs see it.

/** Where every billing email points: the billing page, where owners pay, change or cancel. */
export const billingLink = () => `${siteUrl()}/dashboard/settings/billing`

export interface NoticeRunResult {
  /** Workspaces moved to Free because their grace ran out. */
  graceExpired: number
  /** Grace expiries that failed; tried again next run. */
  graceFailed: number
  due: number
  sent: number
  /** Sent by another run since they were listed. */
  skipped: number
  /** No mail went out to any owner; tried again next run. */
  failed: number
  byKind: Partial<Record<BillingNoticeKind, number>>
  failures: { organizationId: string; kind: BillingNoticeKind; error: string }[]
}

type NoticeSendResult = Omit<NoticeRunResult, "graceExpired" | "graceFailed">

const errorText = (err: unknown) => maskPII(err instanceof Error ? err.message : String(err)).slice(0, 300)

type Send = typeof sendBillingNotice

/** The daily run: grace expiries, then every notice due. Never throws for one workspace. */
export async function runBillingNotices(db: Db, now = new Date(), send: Send = sendBillingNotice): Promise<NoticeRunResult> {
  let graceExpired = 0
  let graceFailed = 0
  for (const id of await dueGraceExpiries(db, now)) {
    try {
      const result = await db.transaction((tx) => expireGrace(tx, id, now))
      if (result.outcome === "applied") graceExpired++
    } catch (err) {
      graceFailed++
      console.error("[billing] couldn't end the grace of a workspace:", errorText(err))
    }
  }
  // the downgrade emails for these go out in the same run
  return { graceExpired, graceFailed, ...(await sendNotices(db, now, null, send)) }
}

/** Sends what is due for these workspaces now (after a webhook), instead of waiting for the cron. */
export async function sendBillingNoticesFor(db: Db, organizationIds: string[], now = new Date(), send: Send = sendBillingNotice) {
  return sendNotices(db, now, organizationIds, send)
}

async function sendNotices(db: Db, now: Date, organizationIds: string[] | null, send: Send): Promise<NoticeSendResult> {
  const due = await dueBillingNotices(db, now, organizationIds)
  const result: NoticeSendResult = { due: due.length, sent: 0, skipped: 0, failed: 0, byKind: {}, failures: [] }
  const link = billingLink()
  for (const n of due) {
    try {
      if (!(await claimBillingNotice(db, n))) {
        result.skipped++
        continue
      }
      const delivered = await Promise.all(n.recipients.map((r) => send(r.email, n, isLocale(r.locale) ? r.locale : DEFAULT_LOCALE, link)))
      const reached = delivered.filter(Boolean).length
      if (reached) {
        await finishBillingNotice(db, n, reached)
        result.sent++
        result.byKind[n.kind] = (result.byKind[n.kind] ?? 0) + 1
      } else {
        await releaseBillingNotice(db, n)
        result.failed++
        result.failures.push({ organizationId: n.organizationId, kind: n.kind, error: "no owner could be emailed" })
      }
    } catch (err) {
      result.failed++
      result.failures.push({ organizationId: n.organizationId, kind: n.kind, error: errorText(err) })
    }
  }
  return result
}
