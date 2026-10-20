import type { BillingInterval, PaidPlan } from "@apex/db"
import type { Locale } from "@/lib/i18n/config"

// The plan someone picked on the pricing page, carried through sign-up to the billing page as
// ?plan=pro&interval=year. No server imports: the pricing page and the auth modal use it too.

export const BILLING_PATH = "/dashboard/settings/billing"

const PLANS: readonly PaidPlan[] = ["starter", "pro", "business"]
const INTERVALS: readonly BillingInterval[] = ["month", "year"]

export interface PlanChoice {
  plan: PaidPlan
  interval: BillingInterval
}

export const isPaidPlan = (v: unknown): v is PaidPlan => PLANS.includes(v as PaidPlan)
export const isInterval = (v: unknown): v is BillingInterval => INTERVALS.includes(v as BillingInterval)

/** The choice in `plan` and `interval`, or null unless both are valid. */
export function parsePlanChoice(plan: unknown, interval: unknown): PlanChoice | null {
  return isPaidPlan(plan) && isInterval(interval) ? { plan, interval } : null
}

/** The billing page, with the plan to offer when there is one. */
export function billingPath(choice?: PlanChoice | null): string {
  return choice ? `${BILLING_PATH}?${new URLSearchParams({ plan: choice.plan, interval: choice.interval })}` : BILLING_PATH
}

/** A `next` that points at the billing page, rebuilt from its plan choice so nothing else rides along. */
export function billingNextPath(raw: string): string | null {
  if (!raw.startsWith(BILLING_PATH)) return null
  const rest = raw.slice(BILLING_PATH.length)
  if (rest === "") return BILLING_PATH
  if (!rest.startsWith("?")) return null
  const query = new URLSearchParams(rest)
  const choice = parsePlanChoice(query.get("plan"), query.get("interval"))
  return choice ? billingPath(choice) : null
}

// Paddle Checkout speaks English and Turkish of our languages; the others get English
const CHECKOUT_LOCALES: Record<Locale, string> = { en: "en", tr: "tr", lt: "en", lv: "en", et: "en" }
export const checkoutLocale = (locale: Locale) => CHECKOUT_LOCALES[locale]
