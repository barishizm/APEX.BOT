import { featureEnabled, getBillingCustomerId, getSubscription, hitRateLimit, membership, organizationForCustomer, type Db, type MemberRole } from "@apex/db"
import { checkoutLocale, type PlanChoice } from "./intent.ts"
import type { BillingProvider, CheckoutConfig } from "./types.ts"
import type { Locale } from "../i18n/config"

// Starting a checkout and following it until the webhook lands (app/api/billing/checkout). The
// browser only says which plan; the workspace, the payer and the price are decided here.

export const canPay = (role: MemberRole) => role === "owner" || role === "admin"

/**
 * Per user: a few attempts at checkout, polling every couple of seconds while one is processing,
 * managing the subscription (each preview is a call to the provider), and reading invoices.
 */
const LIMITS = {
  start: { max: 10, windowSeconds: 600 },
  poll: { max: 60, windowSeconds: 60 },
  manage: { max: 40, windowSeconds: 600 },
  read: { max: 30, windowSeconds: 60 },
}

export class CheckoutRefused extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "forbidden"
      | "billing_disabled"
      | "already_subscribed"
      | "rate_limited"
      | "not_found"
      // managing a subscription (lib/billing/manage.ts)
      | "no_subscription"
      | "pending_change"
      | "not_canceling"
      | "invalid_cap"
      | "plan_has_no_overage"
      | "overage_unavailable",
    message: string,
  ) {
    super(message)
  }
}

/**
 * The caller's workspace, if they may pay for it (or, with `readOnly`, just belong to it) and plans
 * are on sale there.
 */
export async function payingWorkspace(q: Db, userId: string, provider: BillingProvider | null, limit: keyof typeof LIMITS, readOnly = false) {
  const member = await membership(q, userId)
  if (!readOnly && !canPay(member.role)) throw new CheckoutRefused(403, "forbidden", "Only the workspace's owner or an admin can manage billing")
  // as billingLive (lib/billing/live.ts): a provider exists only with the whole configuration
  if (!provider || !(await featureEnabled(q, "billing", member.organization_id))) throw new CheckoutRefused(409, "billing_disabled", "Plans aren't on sale yet")
  const over = await hitRateLimit(q, `billing:${limit}:${userId}`, LIMITS[limit])
  if (over) throw new CheckoutRefused(429, "rate_limited", "Too many attempts. Try again in a few minutes")
  return { ...member, provider }
}

export async function startCheckout(q: Db, provider: BillingProvider | null, user: { id: string; email: string }, choice: PlanChoice, locale: Locale): Promise<CheckoutConfig> {
  const { organization_id: organizationId, provider: p } = await payingWorkspace(q, user.id, provider, "start")
  const sub = await getSubscription(q, organizationId)
  // a second subscription would bill twice; plan changes go through changePlan instead
  if (sub && sub.status !== "canceled") throw new CheckoutRefused(409, "already_subscribed", "This workspace already has a subscription")

  // The workspace's customer once it has paid; else the payer's, so Paddle prefills their email,
  // unless that customer already pays for another workspace (one customer per workspace)
  let customerId = await getBillingCustomerId(q, organizationId)
  if (!customerId) {
    const found = await p.findOrCreateCustomer(user.email)
    const owner = await organizationForCustomer(q, p.id, found)
    customerId = !owner || owner === organizationId ? found : null
  }
  return p.createCheckout({ id: organizationId, customerId }, choice.plan, choice.interval, { locale: checkoutLocale(locale) })
}

export type CheckoutState = "processing" | "active" | "failed"

/**
 * Where the caller's checkout stands: active once the webhook stored the subscription it created,
 * failed if the provider gave up on the payment, processing until then.
 */
export async function checkoutState(q: Db, provider: BillingProvider | null, userId: string, transactionId: string): Promise<{ state: CheckoutState; plan: string | null }> {
  const { organization_id: organizationId, provider: p } = await payingWorkspace(q, userId, provider, "poll")
  const status = await p.checkoutStatus(transactionId)
  // someone else's checkout, or one not made by startCheckout: as if it didn't exist
  if (status.organizationId !== organizationId) throw new CheckoutRefused(404, "not_found", "Checkout not found")
  const sub = await getSubscription(q, organizationId)
  if (sub && status.subscriptionId && sub.providerSubscriptionId === status.subscriptionId && (sub.status === "active" || sub.status === "trialing"))
    return { state: "active", plan: sub.plan }
  return { state: status.status === "canceled" || status.status === "past_due" ? "failed" : "processing", plan: null }
}
