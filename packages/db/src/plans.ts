import type { Queryable } from "./db.ts"

// Subscription plans, as on the pricing page. Set per workspace (app.organizations.plan).
export type Plan = "free" | "starter" | "pro" | "business"
export const PLANS: readonly Plan[] = ["free", "starter", "pro", "business"]

export const PLAN_LIMITS: Record<Plan, { websitePages: number }> = {
  free: { websitePages: 50 },
  starter: { websitePages: 300 },
  pro: { websitePages: 1000 },
  business: { websitePages: 3000 },
}

/**
 * Pages one website crawl can read before its function call times out. Plans above this are
 * held to it until crawls can continue across calls.
 */
export const CRAWL_PAGE_CEILING = 300

/** Pages (web pages and linked documents) read from each website on this plan. */
export const websitePageLimit = (plan: Plan) => Math.min(PLAN_LIMITS[plan].websitePages, CRAWL_PAGE_CEILING)

const toPlan = (raw: unknown): Plan => (PLANS.includes(raw as Plan) ? (raw as Plan) : "free")

/** The plan of the workspace a bot belongs to. */
export async function botPlan(q: Queryable, botId: string): Promise<Plan> {
  const { rows } = await q.query<{ plan: string }>(
    "select o.plan from app.bots b join app.organizations o on o.id = b.organization_id where b.id = $1",
    [botId],
  )
  return toPlan(rows[0]?.plan)
}

