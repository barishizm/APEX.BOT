import { dueRefreshes } from "@apex/db"
import { db } from "@/lib/db"
import { cronAuthorized } from "@/lib/knowledge"

// Websites read per run. Each is read by its own function call (below), so one slow site can't
// hold up the rest; anything left over is picked up the next day.
const PER_RUN = 50

// Daily (vercel.json): starts reading every website that is due for a refresh
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 })
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
  const started = results.filter((r) => r.status === "fulfilled" && r.value === 202).length
  console.log(`[knowledge] refresh: ${due.length} due, ${started} started`)
  return Response.json({ due: due.length, started })
}
