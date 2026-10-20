import type { Queryable } from "./db.ts"

// Subscription plans, as on the pricing page. Set per workspace (app.organizations.plan).
// This file is the only source of what each plan includes and costs (docs/adr/0003-billing.md);
// the pricing page and its dictionaries read their numbers from here.
export type Plan = "free" | "starter" | "pro" | "business"
export const PLANS: readonly Plan[] = ["free", "starter", "pro", "business"]

/** Model price tiers a plan can unlock. A model's tier in bot-settings maps onto these (MODEL_TIER_OF). */
export type ModelTier = "fast" | "standard" | "premium"
export const MODEL_TIERS: readonly ModelTier[] = ["fast", "standard", "premium"]
export const MODEL_TIER_OF = { fast: "fast", balanced: "standard", flagship: "premium" } as const satisfies Record<string, ModelTier>

export interface PlanEntitlements {
  /** AI replies included per monthly window, in standard-model replies (ADR 0003 (b)). */
  monthlyReplies: number
  /** Websites (bots) that can be active at once. */
  websites: number
  /** Pages read from each website; crawls are further held to CRAWL_PAGE_CEILING. */
  websitePages: number
  allowedModelTiers: readonly ModelTier[]
  /** Hide "Powered by Apex Bot" in the widget. */
  removeBranding: boolean
  declineTopics: boolean
  leadCapture: boolean
  /** Longest conversation retention a bot on this plan can choose. */
  maxRetentionDays: number
  /** Whether the owner can turn on paid replies past the monthly allowance. */
  overageAllowed: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanEntitlements> = {
  free: {
    monthlyReplies: 100,
    websites: 1,
    websitePages: 50,
    allowedModelTiers: ["fast"],
    removeBranding: false,
    declineTopics: false,
    leadCapture: false,
    maxRetentionDays: 30,
    overageAllowed: false,
  },
  starter: {
    monthlyReplies: 600,
    websites: 1,
    websitePages: 300,
    allowedModelTiers: MODEL_TIERS,
    removeBranding: false,
    declineTopics: false,
    leadCapture: true,
    maxRetentionDays: 90,
    overageAllowed: true,
  },
  pro: {
    monthlyReplies: 1500,
    websites: 3,
    websitePages: 1000,
    allowedModelTiers: MODEL_TIERS,
    removeBranding: true,
    declineTopics: true,
    leadCapture: true,
    maxRetentionDays: 180,
    overageAllowed: true,
  },
  business: {
    monthlyReplies: 5000,
    websites: 10,
    websitePages: 3000,
    allowedModelTiers: MODEL_TIERS,
    removeBranding: true,
    declineTopics: true,
    leadCapture: true,
    maxRetentionDays: 365,
    overageAllowed: true,
  },
}

// Each plan's monthly AI replies keep a gross margin above 50% even at full use on the costliest
// model mix, and around 75% at typical use; recheck against the model prices before changing them.
/** Prices in US cents: `monthly` per month, `annual` per year (shown per month on the pricing page). */
export const PLAN_PRICES: Record<Plan, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 2900, annual: 28800 },
  pro: { monthly: 7900, annual: 78000 },
  business: { monthly: 24900, annual: 238800 },
}

/** Overage is sold in blocks of replies (ADR 0003 (c)). */
export const OVERAGE_BLOCK = { replies: 100, priceCents: 500 }

/** Share of the monthly price an annual subscription saves, 0 for Free. */
export function annualSaving(plan: Plan) {
  const { monthly, annual } = PLAN_PRICES[plan]
  return monthly ? 1 - annual / (monthly * 12) : 0
}

/**
 * What a workspace on `plan` may use. `overrides` (a custom deal, a beta grant) replace single
 * entitlements; keys left undefined keep the plan's value.
 */
export function entitlementsFor(plan: Plan, overrides: Partial<PlanEntitlements> = {}): PlanEntitlements {
  const base = PLAN_LIMITS[plan]
  const set = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
  const merged = { ...base, ...set } as PlanEntitlements
  return { ...merged, allowedModelTiers: [...merged.allowedModelTiers] }
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
