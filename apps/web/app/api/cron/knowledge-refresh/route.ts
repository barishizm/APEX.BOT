import { KNOWLEDGE_REFRESH_JOB, dueRefreshes, finishJobRun, startJobRun } from "@apex/db"
import { db } from "@/lib/db"
import { cronAuthorized } from "@/lib/knowledge"

// Websites read per run. Each is read by its own function call (below), so one slow site can't
// hold up the rest; anything left over is picked up the next day.
const PER_RUN = 50

// Daily (vercel.json): starts reading every website that is due for a refresh. Each run is recorded
// in app.job_runs (shown on /admin/knowledge); the crawls themselves report through their sources.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 })
  const runId = await startJobRun(db(), KNOWLEDGE_REFRESH_JOB).catch((err: unknown) => {
    console.error("[knowledge] refresh: couldn't record the run", err)
    return null
  })
  try {
    // the public address: *.vercel.app deployment URLs sit behind Vercel's login
    const base = process.env.NEXT_PUBLIC_SITE_URL || request.url
    const due = await dueRefreshes(db(), PER_RUN)
    const results = await Promise.allSettled(
      due.map(async ({ id }) => {
        const res = await fetch(new URL(`/api/cron/knowledge-refresh/${id}`, base), {
          method: "POST",
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          signal: AbortSignal.timeout(20_000),
        })
        return res.status
      }),
    )
    const count = (test: (r: PromiseSettledResult<number>) => boolean) => results.filter(test).length
    const result = {
      due: due.length,
      started: count((r) => r.status === "fulfilled" && r.value === 202),
      // a manual sync or the bot's other websites were running
      busy: count((r) => r.status === "fulfilled" && r.value === 409),
      failed: count((r) => r.status === "rejected" || (r.value !== 202 && r.value !== 409)),
    }
    console.log(`[knowledge] refresh: ${result.due} due, ${result.started} started`)
    if (runId) await finishJobRun(db(), runId, { ok: result.failed === 0, result }).catch((err: unknown) => console.error("[knowledge] refresh: couldn't record the result", err))
    return Response.json({ due: result.due, started: result.started })
  } catch (err) {
    if (runId) await finishJobRun(db(), runId, { ok: false, error: err instanceof Error ? err.message : String(err) }).catch(() => {})
    throw err
  }
}
