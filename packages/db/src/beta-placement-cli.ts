import { parseArgs } from "node:util"
import { createDbFromEnv } from "./db.ts"
import { BETA_PLACEMENT_DAYS, applyBetaPlacement, planBetaPlacements, type BetaPlacementOptions } from "./beta-placement.ts"
import { PLANS, type Plan } from "./plans.ts"

// Places the beta workspaces on plans at launch (docs/adr/0003-billing.md (g); beta-placement.ts).
//   npm run billing:beta-placement -- --dry-run                 what would happen, nothing written
//   npm run billing:beta-placement -- --apply                   do it
// Options:
//   --plan auto|starter|pro|business   auto (default): the plan that covers each one's last 30 days
//   --days 60 | --months 2             how long the plan is free (default 60 days)
//   --min-plan starter                 with auto, the least a workspace gets ("free" leaves small ones on Free)
//   --created-before 2026-11-01        only workspaces created before this (default: now)
// Workspaces that pay, or were placed by an earlier run, are skipped; running it again is harmless.
// Reads DATABASE_URL like the migrations: check which database it points to before --apply.

const DAY = 24 * 60 * 60 * 1000

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    plan: { type: "string", default: "auto" },
    days: { type: "string" },
    months: { type: "string" },
    "min-plan": { type: "string", default: "starter" },
    "created-before": { type: "string" },
  },
})

if (values["dry-run"] === values.apply) fail("Choose one: --dry-run to see what would happen, or --apply to do it")
const plan = values.plan as BetaPlacementOptions["plan"]
if (plan !== "auto" && !PLANS.includes(plan as Plan)) fail(`--plan must be auto, ${PLANS.filter((p) => p !== "free").join(", ")}`)
if (plan === ("free" as string)) fail("--plan free places nobody; a beta workspace without a placement moves to Free at launch anyway")
const minPlan = values["min-plan"] as Plan
if (!PLANS.includes(minPlan)) fail(`--min-plan must be one of ${PLANS.join(", ")}`)
if (values.days && values.months) fail("Give --days or --months, not both")

const now = new Date()
const count = (raw: string, name: string) => {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 24 * 31) fail(`--${name} must be a whole number above 0`)
  return n
}
let endsAt: Date
if (values.months) {
  endsAt = new Date(now)
  endsAt.setUTCMonth(endsAt.getUTCMonth() + count(values.months, "months"))
} else {
  endsAt = new Date(now.getTime() + count(values.days ?? String(BETA_PLACEMENT_DAYS), "days") * DAY)
}
const createdBefore = values["created-before"] ? new Date(values["created-before"]) : now
if (Number.isNaN(createdBefore.getTime())) fail("--created-before must be a date, e.g. 2026-11-01")

const opts: BetaPlacementOptions = { now, endsAt, plan, minPlan, createdBefore }
const db = createDbFromEnv()
try {
  const placements = await planBetaPlacements(db, opts)
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host
    } catch {
      return "?"
    }
  })()
  console.log(`${values.apply ? "Applying" : "Dry run"} on ${host}: ${placements.length} beta workspaces, plans free until ${endsAt.toISOString()}`)
  console.table(
    placements.map((p) => ({
      workspace: p.name.slice(0, 32),
      id: p.organizationId,
      now: p.current,
      replies: Math.round(p.usage.replyFifths / 5),
      websites: p.usage.websites,
      pages: p.usage.pages,
      models: p.usage.modelTier,
      covers: p.fits ? p.covering : `${p.covering} (short)`,
      gets: p.plan ?? `- (${p.skip})`,
    })),
  )
  const todo = placements.filter((p) => p.plan)
  const short = placements.filter((p) => !p.fits).length
  const byPlan = Object.fromEntries(PLANS.map((pl) => [pl, todo.filter((p) => p.plan === pl).length]).filter(([, n]) => n))
  console.log(`To place: ${todo.length} ${JSON.stringify(byPlan)}; skipped: ${placements.length - todo.length}${short ? `; ${short} use more than Business covers` : ""}`)

  if (values.apply) {
    let applied = 0
    for (const p of todo) {
      try {
        const result = await db.transaction((tx) => applyBetaPlacement(tx, p, opts))
        if (result.applied) applied++
        else console.log(`  skipped ${p.organizationId}: ${result.reason}`)
      } catch (err) {
        process.exitCode = 1
        console.error(`  failed ${p.organizationId}:`, err instanceof Error ? err.message : err)
      }
    }
    console.log(`Placed ${applied} of ${todo.length}.`)
  } else {
    console.log("Nothing was written. Run again with --apply to place them.")
  }
} finally {
  await db.close()
}
