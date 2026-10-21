import {
  closedOverageWindows,
  lockOverageWindow,
  markOverageBilled,
  markOverageFailed,
  maskPII,
  overageBlocks,
  type Db,
  type OverageWindowRef,
} from "@apex/db"
import { readBillingConfig } from "./config.ts"
import { createPaddleProvider } from "./paddle.ts"
import type { BillingProvider } from "./types.ts"

// Billing overage at the end of each reply window (docs/adr/0003-billing.md (c)), run by
// /api/cron/billing-overage. Each closed window with overage is charged once, as a one-time charge
// of the overage price on the workspace's subscription: blocks of 100 replies, rounded up, never past
// the owner's cap. The window row stays locked from the check to the record, the charge carries an
// idempotency key per workspace and window, and overage_billed_at is set in the same transaction, so
// neither a second run nor a run that died after Paddle took the charge bills it again.

/** What a run needs from billing: the provider and the overage price; null while either is missing. */
export interface OverageBilling {
  provider: BillingProvider
  priceId: string
}

export function overageBilling(env: Record<string, string | undefined> = process.env): OverageBilling | null {
  const { config } = readBillingConfig(env)
  return config?.overagePriceId ? { provider: createPaddleProvider(config), priceId: config.overagePriceId } : null
}

/** The charge's idempotency key: one per workspace and window. */
export const overageChargeKey = (w: OverageWindowRef) => `overage:${w.organizationId}:${w.periodStart.toISOString()}`

/** Windows charged per run; the rest wait for the next day. Each charge can take Paddle ~30 s. */
export const OVERAGE_PER_RUN = 25

export interface OverageRunResult {
  due: number
  billed: number
  /** Blocks of 100 replies billed in all. */
  blocks: number
  /** Billed at the cap because the usage asked for more. */
  capped: number
  /** Found already charged at Paddle (a run that died after the charge) and recorded. */
  duplicates: number
  /** Billed or held by another run since they were listed. */
  skipped: number
  failed: number
  /** The failed windows, for app.job_runs; also kept on each window for /admin/system. */
  failures: { organizationId: string; periodStart: string; error: string }[]
}

const errorText = (err: unknown) => maskPII(err instanceof Error ? err.message : String(err)).slice(0, 1000)

/** Charges every closed window's overage that isn't billed yet, up to `limit`. Never throws for one window. */
export async function billOverage(db: Db, billing: OverageBilling | null, now = new Date(), limit = OVERAGE_PER_RUN): Promise<OverageRunResult> {
  const windows = await closedOverageWindows(db, now, limit)
  const result: OverageRunResult = { due: windows.length, billed: 0, blocks: 0, capped: 0, duplicates: 0, skipped: 0, failed: 0, failures: [] }
  const fail = async (w: OverageWindowRef, error: string) => {
    await markOverageFailed(db, w, error)
    result.failed++
    result.failures.push({ organizationId: w.organizationId, periodStart: w.periodStart.toISOString(), error })
  }

  for (const w of windows) {
    if (!billing) {
      await fail(w, "billing is off or PADDLE_PRICE_OVERAGE isn't set")
      continue
    }
    let error: string | null = null
    try {
      type Outcome = "skipped" | { error: string } | { blocks: number; capped: boolean; duplicate: boolean }
      const outcome = await db.transaction(async (tx): Promise<Outcome> => {
        const locked = await lockOverageWindow(tx, w)
        if (!locked) return "skipped"
        // the chat API stops at the cap already (ReplyQuota); this holds the bill to it as well
        const { blocks, capped } = overageBlocks(locked.overageFifths, locked.capUnits)
        if (blocks === 0) return { error: "the workspace has no overage cap, so nothing can be billed" }
        const sub = locked.subscription
        if (!sub) return { error: "the workspace has no subscription to bill" }
        // Paddle bills one-time charges only to a running subscription
        if (sub.status !== "active" && sub.status !== "trialing") return { error: `the subscription is ${sub.status}` }
        const charge = await billing.provider.createOneTimeCharge(
          { organizationId: w.organizationId, providerSubscriptionId: sub.providerSubscriptionId, plan: sub.plan, interval: sub.interval, currentPeriodEnd: sub.currentPeriodEnd },
          [{ priceId: billing.priceId, quantity: blocks }],
          overageChargeKey(w),
        )
        await markOverageBilled(tx, w, { blocks, transactionId: charge.transactionId, capped, duplicate: charge.duplicate }, now)
        return { blocks, capped, duplicate: charge.duplicate }
      })
      if (outcome === "skipped") result.skipped++
      else if ("error" in outcome) error = outcome.error
      else {
        result.billed++
        result.blocks += outcome.blocks
        if (outcome.capped) result.capped++
        if (outcome.duplicate) result.duplicates++
      }
    } catch (err) {
      error = errorText(err)
    }
    if (error) await fail(w, error)
  }
  return result
}
