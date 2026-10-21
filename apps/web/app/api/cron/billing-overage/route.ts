import { OVERAGE_BILLING_JOB, finishJobRun, maskPII, startJobRun } from "@apex/db"
import { billOverage, overageBilling } from "@/lib/billing/overage"
import { db } from "@/lib/db"
import { cronAuthorized } from "@/lib/knowledge"

// up to OVERAGE_PER_RUN charges, one after another
export const maxDuration = 300

// Daily (vercel.json): charges the overage of every reply window that has closed (lib/billing/overage.ts).
// Each run is recorded in app.job_runs and, with the windows that failed, shown on /admin/system.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 })
  const runId = await startJobRun(db(), OVERAGE_BILLING_JOB).catch((err: unknown) => {
    console.error("[billing] overage: couldn't record the run", maskPII(err instanceof Error ? err.message : String(err)))
    return null
  })
  try {
    const result = await billOverage(db(), overageBilling())
    console.log(`[billing] overage: ${result.due} due, ${result.billed} billed, ${result.failed} failed`)
    if (runId)
      await finishJobRun(db(), runId, {
        ok: result.failed === 0,
        result,
        error: result.failed ? `${result.failed} of ${result.due} windows couldn't be billed` : null,
      }).catch((err: unknown) => console.error("[billing] overage: couldn't record the result", maskPII(err instanceof Error ? err.message : String(err))))
    return Response.json({ due: result.due, billed: result.billed, failed: result.failed })
  } catch (err) {
    if (runId) await finishJobRun(db(), runId, { ok: false, error: maskPII(err instanceof Error ? err.message : String(err)) }).catch(() => {})
    throw err
  }
}
