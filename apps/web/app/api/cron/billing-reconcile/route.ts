import { BILLING_RECONCILE_JOB, finishJobRun, maskPII, startJobRun } from "@apex/db"
import { getBillingProvider } from "@/lib/billing"
import { sendBillingNoticesFor } from "@/lib/billing/notices"
import { reconcileSubscriptions } from "@/lib/billing/reconcile"
import { db } from "@/lib/db"
import { cronAuthorized } from "@/lib/knowledge"

export const maxDuration = 300

// Nightly (vercel.json), before the overage charges: compares Paddle's live subscriptions with
// app.subscriptions and fixes what a lost webhook left behind (lib/billing/reconcile.ts). Each run,
// with the differences it found, is recorded in app.job_runs and shown on /admin/system.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 })
  const provider = getBillingProvider()
  if (!provider) return Response.json({ skipped: "billing_off" })
  const runId = await startJobRun(db(), BILLING_RECONCILE_JOB).catch((err: unknown) => {
    console.error("[billing] reconcile: couldn't record the run", maskPII(err instanceof Error ? err.message : String(err)))
    return null
  })
  try {
    const result = await reconcileSubscriptions({ db: db(), provider, notify: (ids) => sendBillingNoticesFor(db(), ids) }, runId ?? undefined)
    console.log(`[billing] reconcile: ${result.providerLive} live at Paddle, ${result.storedLive} stored, ${result.fixed} fixed, ${result.unresolved} unresolved`)
    if (runId)
      await finishJobRun(db(), runId, {
        ok: result.unresolved === 0,
        result,
        error: result.unresolved ? `${result.unresolved} differences couldn't be fixed` : null,
      }).catch((err: unknown) => console.error("[billing] reconcile: couldn't record the result", maskPII(err instanceof Error ? err.message : String(err))))
    return Response.json({ providerLive: result.providerLive, storedLive: result.storedLive, fixed: result.fixed, unresolved: result.unresolved })
  } catch (err) {
    if (runId) await finishJobRun(db(), runId, { ok: false, error: maskPII(err instanceof Error ? err.message : String(err)) }).catch(() => {})
    throw err
  }
}
