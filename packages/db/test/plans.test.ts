import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { CRAWL_PAGE_CEILING, MODEL_TIER_OF, PLANS, PLAN_LIMITS, PLAN_PRICES, annualSaving, entitlementsFor, replyWindow, type Plan, type PlanEntitlements } from "../src/plans.ts"
import { MODELS, replyFifths } from "../src/bot-settings.ts"

// What each plan includes, as decided in docs/adr/0003-billing.md. A change here is a pricing change.
const EXPECTED: Record<Plan, PlanEntitlements> = {
  free: { monthlyReplies: 100, websites: 1, websitePages: 50, allowedModelTiers: ["fast"], removeBranding: false, declineTopics: false, leadCapture: false, maxRetentionDays: 30, overageAllowed: false },
  starter: { monthlyReplies: 600, websites: 1, websitePages: 300, allowedModelTiers: ["fast", "standard", "premium"], removeBranding: false, declineTopics: false, leadCapture: true, maxRetentionDays: 90, overageAllowed: true },
  pro: { monthlyReplies: 1500, websites: 3, websitePages: 300, allowedModelTiers: ["fast", "standard", "premium"], removeBranding: true, declineTopics: true, leadCapture: true, maxRetentionDays: 180, overageAllowed: true },
  business: { monthlyReplies: 5000, websites: 10, websitePages: 300, allowedModelTiers: ["fast", "standard", "premium"], removeBranding: true, declineTopics: true, leadCapture: true, maxRetentionDays: 365, overageAllowed: true },
}

const PRICES: Record<Plan, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 2900, annual: 28800 },
  pro: { monthly: 7900, annual: 78000 },
  business: { monthly: 24900, annual: 238800 },
}

describe("plan entitlements", () => {
  test("no plan sells more website pages than one crawl can read", () => {
    for (const plan of PLANS) assert.ok(PLAN_LIMITS[plan].websitePages <= CRAWL_PAGE_CEILING, plan)
  })

  for (const plan of PLANS) {
    test(`${plan}: entitlements and prices`, () => {
      assert.deepEqual(entitlementsFor(plan), EXPECTED[plan])
      assert.deepEqual(PLAN_PRICES[plan], PRICES[plan])
      // the pricing page shows annual prices per month in whole dollars
      assert.equal(PLAN_PRICES[plan].annual % 1200, 0)
    })
  }

  test("each plan includes at least what the one below it does", () => {
    for (let i = 1; i < PLANS.length; i++) {
      const lower = PLAN_LIMITS[PLANS[i - 1]!]
      const upper = PLAN_LIMITS[PLANS[i]!]
      for (const key of Object.keys(lower) as (keyof PlanEntitlements)[]) {
        const [a, b] = [lower[key], upper[key]]
        if (Array.isArray(a)) assert.ok((a as string[]).every((t) => (b as string[]).includes(t)), `${PLANS[i]}.${key}`)
        else assert.ok(b >= a, `${PLANS[i]}.${key}`)
      }
      assert.ok(PLAN_PRICES[PLANS[i]!].monthly > PLAN_PRICES[PLANS[i - 1]!].monthly)
    }
  })

  test("overrides replace single entitlements and leave the plan untouched", () => {
    const custom = entitlementsFor("starter", { monthlyReplies: 2000, removeBranding: true, websites: undefined })
    assert.deepEqual(custom, { ...EXPECTED.starter, monthlyReplies: 2000, removeBranding: true })
    assert.deepEqual(entitlementsFor("free", { allowedModelTiers: ["fast", "standard"] }).allowedModelTiers, ["fast", "standard"])
    // the result is a copy: changing it doesn't reach PLAN_LIMITS
    ;(custom.allowedModelTiers as string[]).pop()
    assert.deepEqual(PLAN_LIMITS.starter, EXPECTED.starter)
  })

  test("annual saving is at most 20%, none on Free", () => {
    assert.equal(annualSaving("free"), 0)
    assert.equal(Math.round(Math.max(...PLANS.map(annualSaving)) * 100), 20)
  })

  test("every model's tier maps to a plan tier", () => {
    for (const m of MODELS) assert.ok(MODEL_TIER_OF[m.tier], m.id)
  })
})

describe("reply windows", () => {
  const d = (iso: string) => new Date(iso)
  const win = (anchor: string | null, now: string) => {
    const w = replyWindow(anchor ? d(anchor) : null, d(now))
    return [w.start.toISOString(), w.end.toISOString()]
  }

  test("Free: calendar months from the 1st, 00:00 UTC", () => {
    assert.deepEqual(win(null, "2027-01-31T23:59:59.999Z"), ["2027-01-01T00:00:00.000Z", "2027-02-01T00:00:00.000Z"])
    assert.deepEqual(win(null, "2027-02-01T00:00:00.000Z"), ["2027-02-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z"])
    assert.deepEqual(win(null, "2027-12-15T08:00:00.000Z"), ["2027-12-01T00:00:00.000Z", "2028-01-01T00:00:00.000Z"])
  })

  test("paid: from the billing anchor, at its time of day", () => {
    assert.deepEqual(win("2027-01-10T12:00:00Z", "2027-01-10T12:00:00Z"), ["2027-01-10T12:00:00.000Z", "2027-02-10T12:00:00.000Z"])
    assert.deepEqual(win("2027-01-10T12:00:00Z", "2027-02-10T11:59:59Z"), ["2027-01-10T12:00:00.000Z", "2027-02-10T12:00:00.000Z"])
    // an annual subscription: every month of the paid year
    assert.deepEqual(win("2027-01-10T12:00:00Z", "2027-08-20T00:00:00Z"), ["2027-08-10T12:00:00.000Z", "2027-09-10T12:00:00.000Z"])
  })

  test("a 31st is clamped to short months and comes back after them", () => {
    assert.deepEqual(win("2027-01-31T10:00:00Z", "2027-02-28T10:00:00Z"), ["2027-02-28T10:00:00.000Z", "2027-03-31T10:00:00.000Z"])
    assert.deepEqual(win("2027-01-31T10:00:00Z", "2027-04-15T00:00:00Z"), ["2027-03-31T10:00:00.000Z", "2027-04-30T10:00:00.000Z"])
    assert.deepEqual(win("2027-01-31T10:00:00Z", "2028-02-29T10:00:00Z"), ["2028-02-29T10:00:00.000Z", "2028-03-31T10:00:00.000Z"])
  })

  test("a moment before the anchor falls in the window before it", () => {
    assert.deepEqual(win("2027-03-15T00:00:00Z", "2027-03-14T00:00:00Z"), ["2027-02-15T00:00:00.000Z", "2027-03-15T00:00:00.000Z"])
  })
})

describe("reply weights", () => {
  test("every model in the catalog has one, a whole number of fifths", () => {
    for (const m of MODELS) {
      const f = replyFifths(m.provider, m.id)
      assert.ok(Number.isInteger(f) && f >= 1, m.id)
    }
  })
})
