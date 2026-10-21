import { BILLING_NOTICES_JOB, finishJobRun, startJobRun } from "@apex/db"
import { runBillingNotices } from "@/lib/billing/notices"
import { db } from "@/lib/db"
import { cronAuthorized } from "@/lib/knowledge"

export const maxDuration = 300

// Daily (vercel.json): ends the grace of failed payments, moves workspaces whose override ended off
// its plan, and sends the billing emails that are due
// (lib/billing/notices.ts). Each run is recorded in app.job_runs.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 })
  const runId = await startJobRun(db(), BILLING_NOTICES_JOB).catch((err: unknown) => {
    console.error("[billing] notices: couldn't record the run", err)
    return null
  })
  try {
    const result = await runBillingNotices(db())
    console.log(`[billing] notices: ${result.graceExpired} graces ended, ${result.plansChanged} plans changed, ${result.due} due, ${result.sent} sent, ${result.failed} failed`)
    const failed = result.failed + result.graceFailed + (result.plansChanged < 0 ? 1 : 0)
    if (runId)
      await finishJobRun(db(), runId, {
        ok: failed === 0,
        result,
        error: failed ? `${result.failed} notices and ${result.graceFailed} grace expiries failed${result.plansChanged < 0 ? "; plans couldn't be recomputed" : ""}` : null,
      }).catch((err: unknown) => console.error("[billing] notices: couldn't record the result", err))
    return Response.json({ graceExpired: result.graceExpired, due: result.due, sent: result.sent, failed })
  } catch (err) {
    if (runId) await finishJobRun(db(), runId, { ok: false, error: err instanceof Error ? err.message : String(err) }).catch(() => {})
    throw err
  }
}
