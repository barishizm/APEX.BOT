import type { BillingInterval, BillingProviderId, PaidPlan, ScheduledChange, SubscriptionStatus } from "@apex/db"

// The provider-neutral billing surface (docs/adr/0003-billing.md, "Adapter and data"). Plan, quota
// and grace logic read only these types and our tables, never a provider's payloads or ids.

export type { BillingInterval, BillingProviderId, PaidPlan }

export type BillingErrorCode =
  /** Billing is off: keys or price ids are missing (lib/billing/config.ts). */
  | "disabled"
  | "invalid_input"
  /** The change asked for is what the subscription already has. */
  | "no_change"
  /** A webhook body that isn't a provider event we can read. */
  | "invalid_payload"
  /** The provider refused or failed the call; `status` and `providerCode` say how. */
  | "provider_error"

export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
    readonly details: { status?: number; providerCode?: string; requestId?: string } = {},
  ) {
    super(message)
    this.name = "BillingError"
  }
}

/** The workspace starting a checkout. */
export interface BillingOrg {
  id: string
  /**
   * The provider's customer the checkout is for: the workspace's own once it has paid, else the
   * payer's (findOrCreateCustomer), so their email is prefilled. Null lets the payer type one.
   */
  customerId?: string | null
}

/** What the adapter needs to act on a stored subscription (app.subscriptions). */
export interface SubscriptionRef {
  organizationId: string
  providerSubscriptionId: string
  plan: PaidPlan
  interval: BillingInterval
  currentPeriodEnd: Date
}

export interface PlanTarget {
  plan: PaidPlan
  interval: BillingInterval
}

/**
 * Everything the browser needs to open the provider's checkout; holds no secret. The price, the
 * workspace (signed custom_data) and the customer are on the server-made transaction, out of the
 * browser's reach.
 */
export interface CheckoutConfig {
  provider: BillingProviderId
  environment: "sandbox" | "production"
  /** Paddle.js client-side token (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN). */
  clientToken: string
  transactionId: string
  settings: { locale?: string; successUrl?: string }
}

/** Where a checkout's transaction stands, as the provider sees it now. */
export interface CheckoutStatus {
  /** The provider's transaction status (Paddle: draft, ready, billed, paid, completed, canceled, past_due). */
  status: string
  /** The subscription the payment created, once there is one. */
  subscriptionId: string | null
  /** The workspace from the transaction's signed custom_data; null if it isn't one of our checkouts. */
  organizationId: string | null
}

/** When a plan change takes effect (ADR 0003 (a)): upgrades now, prorated; downgrades at the period end. */
export type ChangeTiming = "immediately" | "period_end"

export interface ChangePreview {
  timing: ChangeTiming
  currency: string
  /** Charged right away, tax included, in the currency's smallest unit; 0 when nothing is due now. */
  dueNowMinor: number
  /** Unused time credited to the customer's balance, in the smallest unit. */
  creditMinor: number
  /** When the next renewal bills, and how much, with the change applied. */
  nextBilledAt: Date | null
  nextTotalMinor: number | null
}

/** A one-time charge line: a non-recurring catalog price and how many of it. */
export interface OneTimeItem {
  priceId: string
  quantity: number
}

export interface OneTimeChargeResult {
  /** The provider's transaction, when it could be found right after the charge. */
  transactionId: string | null
  /** A charge with this idempotency key already existed; nothing new was billed. */
  duplicate: boolean
}

export interface Invoice {
  /** The provider's transaction id; pass it to invoicePdfUrl. */
  id: string
  /** The legal invoice number; null until the provider issues one. */
  number: string | null
  status: string
  kind: PaymentKind
  billedAt: Date | null
  totalMinor: number
  currency: string
  subscriptionId: string | null
}

export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>

/** Why money moved: a first checkout, a renewal, a plan change, a one-time charge (overage) or anything else. */
export type PaymentKind = "checkout" | "renewal" | "change" | "one_time" | "other"

/**
 * The provider's view of a subscription, ready for applyBillingEvent once the organization is
 * known. The period is null when the provider no longer has one (Paddle drops it on cancellation):
 * keep the stored one.
 */
export interface NormalizedSubscription {
  provider: BillingProviderId
  providerSubscriptionId: string
  customerId: string
  plan: PaidPlan
  interval: BillingInterval
  status: SubscriptionStatus
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  scheduledChange: ScheduledChange | null
  /** The event's time: applyBillingEvent ignores anything not newer than what it holds. */
  providerUpdatedAt: Date
}

interface EventBase {
  provider: BillingProviderId
  eventId: string
  /** The provider's own event name, for the inbox and the logs. */
  providerType: string
  occurredAt: Date
  /** From the checkout's custom data; null when the provider didn't carry it (look it up by subscription). */
  organizationId: string | null
}

export type BillingEvent =
  | (EventBase & {
      type: "subscription.updated"
      /** What happened, for emails and the audit trail; the state to store is `subscription`. */
      reason: "created" | "activated" | "updated" | "trialing" | "past_due" | "paused" | "resumed" | "canceled"
      subscription: NormalizedSubscription
    })
  | (EventBase & {
      type: "payment.succeeded" | "payment.failed"
      transactionId: string
      customerId: string | null
      subscriptionId: string | null
      kind: PaymentKind
      amountMinor: number
      currency: string
      invoiceNumber: string | null
      /** The last attempt's failure reason (Paddle error_code), on payment.failed. */
      errorCode: string | null
    })
  | (EventBase & {
      type: "customer.updated"
      customerId: string
    })
  | (EventBase & {
      type: "ignored"
      /** Why it needs no action, e.g. "unhandled_type" or "unknown_price". */
      reason: string
    })

export interface BillingProvider {
  id: BillingProviderId
  environment: "sandbox" | "production"
  /** The provider's customer with this email, created if there is none. */
  findOrCreateCustomer(email: string): Promise<string>
  /** Creates the transaction for `plan` billed every `interval`, and what the browser needs to open its checkout. */
  createCheckout(org: BillingOrg, plan: PaidPlan, interval: BillingInterval, opts?: { discountId?: string; locale?: string; successUrl?: string }): Promise<CheckoutConfig>
  /** Where a checkout started by createCheckout stands. */
  checkoutStatus(transactionId: string): Promise<CheckoutStatus>
  /** A short-lived link to the provider's portal (payment method, invoices, cancellation). Never store it. */
  portalUrl(customerId: string, subscriptionIds?: string[]): Promise<string>
  /** What changePlan would charge or credit, without changing anything. */
  previewChange(sub: SubscriptionRef, target: PlanTarget): Promise<ChangePreview>
  /** Moves the subscription to `target`: upgrades now with proration, downgrades at the period end. */
  changePlan(sub: SubscriptionRef, target: PlanTarget): Promise<{ timing: ChangeTiming }>
  /** The plan runs to the end of the paid period, then the subscription ends. */
  cancelAtPeriodEnd(sub: SubscriptionRef): Promise<void>
  /** Takes back a cancellation scheduled by cancelAtPeriodEnd. */
  resume(sub: SubscriptionRef): Promise<void>
  /**
   * Bills one-time items to the subscription's payment method now. A second call with the same key
   * finds the first charge and bills nothing. Calls with one key must not run concurrently: hold a
   * lock (e.g. the usage window's row) around it.
   */
  createOneTimeCharge(sub: SubscriptionRef, items: OneTimeItem[], idempotencyKey: string): Promise<OneTimeChargeResult>
  /** Paid and billed invoices, newest first. */
  listInvoices(customerId: string): Promise<Invoice[]>
  /** A link to an invoice's PDF that expires within the hour. */
  invoicePdfUrl(invoiceId: string): Promise<string>
  /** Whether the webhook body was signed by the provider with our secret, recently. */
  verifyWebhook(rawBody: string, headers: WebhookHeaders, now?: Date): boolean
  /** Reads a verified webhook body (parsed JSON) into our event type. Throws BillingError("invalid_payload"). */
  normalizeEvent(payload: unknown): BillingEvent
}
