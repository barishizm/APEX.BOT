import type { BillingInterval, PaidPlan } from "./types.ts"

// Billing configuration from the environment. Billing is on only when every key and price id is set
// and they agree on the environment; otherwise it is off and the app runs as before (no checkout,
// no plan changes), with the reason shown on /admin/system. Read on each call so tests and a
// redeploy with new values need no restart logic.

export const PAID_PLANS: readonly PaidPlan[] = ["starter", "pro", "business"]
export const INTERVALS: readonly BillingInterval[] = ["month", "year"]

/** The env var holding a recurring price id, e.g. PADDLE_PRICE_PRO_YEAR. */
export const priceEnvKey = (plan: PaidPlan, interval: BillingInterval) => `PADDLE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`
export const OVERAGE_PRICE_ENV = "PADDLE_PRICE_OVERAGE"

/** Every variable billing reads, in the order the README lists them. */
export const BILLING_ENV_KEYS = [
  "PADDLE_ENV",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  ...PAID_PLANS.flatMap((plan) => INTERVALS.map((interval) => priceEnvKey(plan, interval))),
  OVERAGE_PRICE_ENV,
] as const

export type PaddleEnvironment = "sandbox" | "production"
export type PriceMap = Record<PaidPlan, Record<BillingInterval, string>>

export interface PaddleConfig {
  environment: PaddleEnvironment
  apiKey: string
  webhookSecret: string
  clientToken: string
  prices: PriceMap
  /** The non-recurring overage block price (ADR 0003 (c)); null leaves overage unbillable. */
  overagePriceId: string | null
}

export type BillingStatus =
  | { enabled: true; provider: "paddle"; environment: PaddleEnvironment; overage: boolean }
  /** `missing`: unset variables; `invalid`: set but unusable, with why. */
  | { enabled: false; missing: string[]; invalid: { key: string; reason: string }[] }

const PRICE_ID = /^pri_[a-z\d]{26}$/
// Paddle prefixes keys by environment; a live key with sandbox ids (or the reverse) fails every call
const API_KEY_PREFIX: Record<PaddleEnvironment, string> = { sandbox: "pdl_sdbx_apikey_", production: "pdl_live_apikey_" }
const CLIENT_TOKEN_PREFIX: Record<PaddleEnvironment, string> = { sandbox: "test_", production: "live_" }

type Env = Record<string, string | undefined>

export function readBillingConfig(env: Env = process.env): { config: PaddleConfig; status: BillingStatus & { enabled: true } } | { config: null; status: BillingStatus & { enabled: false } } {
  const get = (k: string) => env[k]?.trim() || undefined
  const missing: string[] = []
  const invalid: { key: string; reason: string }[] = []
  const need = (k: string) => {
    const v = get(k)
    if (!v) missing.push(k)
    return v
  }

  const rawEnv = get("PADDLE_ENV") ?? "sandbox"
  const environment = rawEnv === "sandbox" || rawEnv === "production" ? rawEnv : null
  if (!environment) invalid.push({ key: "PADDLE_ENV", reason: `must be "sandbox" or "production", got "${rawEnv}"` })

  const apiKey = need("PADDLE_API_KEY")
  const webhookSecret = need("PADDLE_WEBHOOK_SECRET")
  // read on the server and handed to the browser in CheckoutConfig, so it needn't be inlined at build
  const clientToken = need("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN")

  if (environment && apiKey && !apiKey.startsWith(API_KEY_PREFIX[environment]))
    invalid.push({ key: "PADDLE_API_KEY", reason: `is not a ${environment} key (expected ${API_KEY_PREFIX[environment]}…)` })
  if (environment && clientToken && !clientToken.startsWith(CLIENT_TOKEN_PREFIX[environment]))
    invalid.push({ key: "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", reason: `is not a ${environment} token (expected ${CLIENT_TOKEN_PREFIX[environment]}…)` })

  const seen = new Map<string, string>()
  const price = (key: string, required: boolean) => {
    const v = required ? need(key) : get(key)
    if (!v) return undefined
    if (!PRICE_ID.test(v)) {
      invalid.push({ key, reason: "is not a Paddle price id (pri_…)" })
      return undefined
    }
    const other = seen.get(v)
    if (other) invalid.push({ key, reason: `is the same price as ${other}` })
    seen.set(v, key)
    return v
  }
  const prices = Object.fromEntries(
    PAID_PLANS.map((plan) => [plan, Object.fromEntries(INTERVALS.map((interval) => [interval, price(priceEnvKey(plan, interval), true)]))]),
  ) as Record<PaidPlan, Record<BillingInterval, string | undefined>>
  const overagePriceId = price(OVERAGE_PRICE_ENV, false) ?? null

  if (missing.length || invalid.length || !environment || !apiKey || !webhookSecret || !clientToken)
    return { config: null, status: { enabled: false, missing, invalid } }
  return {
    config: { environment, apiKey, webhookSecret, clientToken, prices: prices as PriceMap, overagePriceId },
    status: { enabled: true, provider: "paddle", environment, overage: overagePriceId !== null },
  }
}

/** Which plan and interval a recurring price id sells, or null for a price that isn't one of ours. */
export function planForPrice(prices: PriceMap, priceId: string): { plan: PaidPlan; interval: BillingInterval } | null {
  for (const plan of PAID_PLANS) for (const interval of INTERVALS) if (prices[plan][interval] === priceId) return { plan, interval }
  return null
}
