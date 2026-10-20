import { createHmac, timingSafeEqual } from "node:crypto"
import type { ScheduledChange, SubscriptionStatus } from "@apex/db"
import { PLANS } from "@apex/db/plans"
import { PAID_PLANS, planForPrice, type PaddleConfig, type PriceMap } from "./config.ts"
import {
  BillingError,
  type BillingEvent,
  type BillingProvider,
  type ChangePreview,
  type ChangeTiming,
  type Invoice,
  type NormalizedSubscription,
  type PaidPlan,
  type PaymentKind,
  type PlanTarget,
  type SubscriptionRef,
  type WebhookHeaders,
} from "./types.ts"

// Paddle Billing (API version 1) through fetch rather than @paddle/paddle-node-sdk:
// - webhooks are normalised from the raw snake_case JSON, the same bytes app.billing_events stores and
//   the admin area replays; the SDK only parses inside unmarshal(), which also checks a signature a
//   replay no longer has, and hands back camelCased classes the stored payload doesn't match;
// - we call nine endpoints, each typed here by the fields we read, and the fixtures in
//   test/fixtures/paddle pin those fields to real payloads;
// - the SDK would add nothing for idempotency (the API has no idempotency keys) and lags new fields.
// Docs: https://developer.paddle.com/api-reference/overview

const API_BASE = { sandbox: "https://sandbox-api.paddle.com", production: "https://api.paddle.com" } as const
/** How old a webhook signature may be. Paddle signs every delivery afresh; replays inside it are absorbed by the event-id inbox. */
export const SIGNATURE_TOLERANCE_SECONDS = 300
/** Paddle's default for a non-catalog price's quantity; larger quantities are split over several lines. */
const MAX_LINE_QUANTITY = 100

// custom_data keys we own. organization_id comes from the checkout, with apex_org_sig vouching for it;
// the other two hold a downgrade's paid plan until the period it was paid for ends (Paddle can't
// schedule an item change).
const ORG_KEY = "organization_id"
const ORG_SIG_KEY = "apex_org_sig"
const PAID_PLAN_KEY = "apex_paid_plan"
const PAID_UNTIL_KEY = "apex_paid_until"
const CHARGE_MARK = "apex-charge:"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const TRANSACTION_ID = /^txn_[a-z\d]{26}$/
const CUSTOMER_ID = /^ctm_[a-z\d]{26}$/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,120}$/
const STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due", "paused", "canceled"]
const rank = (plan: PaidPlan) => PLANS.indexOf(plan)

/** When a move from `from` to `to` takes effect (ADR 0003 (a)). Null when nothing changes. */
export function changeTiming(from: PlanTarget, to: PlanTarget): ChangeTiming | null {
  if (from.plan === to.plan && from.interval === to.interval) return null
  if (rank(to.plan) !== rank(from.plan)) return rank(to.plan) > rank(from.plan) ? "immediately" : "period_end"
  return to.interval === "year" ? "immediately" : "period_end"
}

// --- Webhook signature ---

function header(headers: WebhookHeaders, name: string): string | null {
  const v = headers instanceof Headers ? headers.get(name) : (headers[name] ?? headers[name.toLowerCase()])
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

/**
 * Checks Paddle-Signature ("ts=<unix>;h1=<hex>", more than one h1 while a secret is rotated): an
 * HMAC-SHA256 of "<ts>:<raw body>" under the endpoint's secret, no older than the tolerance.
 * https://developer.paddle.com/webhooks/about/signature-verification
 */
export function verifyPaddleSignature(rawBody: string, headers: WebhookHeaders, secret: string, now = new Date()): boolean {
  const sig = header(headers, "paddle-signature")
  if (!sig || sig.length > 2048) return false
  let ts: string | null = null
  const h1: string[] = []
  for (const part of sig.split(";")) {
    const eq = part.indexOf("=")
    const [k, v] = [part.slice(0, eq).trim(), part.slice(eq + 1).trim()]
    if (k === "ts") ts = v
    else if (k === "h1") h1.push(v)
  }
  if (!ts || !/^\d{1,12}$/.test(ts) || !h1.length) return false
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_SECONDS) return false
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`, "utf8").digest()
  return h1.some((hex) => /^[0-9a-f]{64}$/i.test(hex) && timingSafeEqual(expected, Buffer.from(hex, "hex")))
}

// --- Workspace signature ---

/**
 * An HMAC of the workspace id under the webhook secret. Paddle.js lets anyone with the public client
 * token open a checkout with any custom_data, so organization_id alone could credit a payment to a
 * workspace the payer doesn't belong to; only custom_data we wrote on the server carries this.
 */
export function signOrganization(organizationId: string, secret: string): string {
  return createHmac("sha256", secret).update(`apex-org:v1:${organizationId.toLowerCase()}`, "utf8").digest("base64url")
}

/** The custom_data that ties a transaction or subscription to its workspace. */
export const organizationData = (organizationId: string, secret: string) => ({ [ORG_KEY]: organizationId, [ORG_SIG_KEY]: signOrganization(organizationId, secret) })

// --- Normalising webhooks ---

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" && v ? v : null)

function date(v: unknown, field: string): Date {
  const d = typeof v === "string" ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) throw new BillingError("invalid_payload", `Paddle event has no valid ${field}`)
  return d
}
const optDate = (v: unknown, field: string) => (v == null ? null : date(v, field))

/** An amount in the smallest unit ("65215") as a number; Paddle sends strings. */
function minor(v: unknown): number {
  const n = typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : NaN
  return Number.isSafeInteger(n) ? n : 0
}

/** The workspace in custom_data, only when its signature is ours; otherwise null (look it up by subscription). */
export function organizationFrom(customData: unknown, secret: string): string | null {
  if (!isObj(customData)) return null
  const id = str(customData[ORG_KEY])
  const sig = str(customData[ORG_SIG_KEY])
  if (!id || !UUID.test(id) || !sig) return null
  const given = Buffer.from(sig)
  const expected = Buffer.from(signOrganization(id, secret))
  return given.length === expected.length && timingSafeEqual(given, expected) ? id.toLowerCase() : null
}

const SUBSCRIPTION_REASONS: Record<string, Extract<BillingEvent, { type: "subscription.updated" }>["reason"]> = {
  "subscription.created": "created",
  "subscription.imported": "created",
  "subscription.activated": "activated",
  "subscription.updated": "updated",
  "subscription.trialing": "trialing",
  "subscription.past_due": "past_due",
  "subscription.paused": "paused",
  "subscription.resumed": "resumed",
  "subscription.canceled": "canceled",
}

const PAYMENT_KINDS: Record<string, PaymentKind> = {
  web: "checkout",
  api: "checkout",
  subscription_recurring: "renewal",
  subscription_update: "change",
  subscription_charge: "one_time",
}
const kindOf = (origin: unknown): PaymentKind => PAYMENT_KINDS[String(origin)] ?? "other"

/**
 * Reads a Paddle webhook body into our event. Pure: the same stored payload always gives the same
 * event, so a replay from the inbox does what the first delivery did.
 */
export function normalizePaddleEvent(payload: unknown, prices: PriceMap, secret: string): BillingEvent {
  if (!isObj(payload) || !isObj(payload.data)) throw new BillingError("invalid_payload", "Not a Paddle event")
  const eventId = str(payload.event_id)
  const providerType = str(payload.event_type)
  if (!eventId || !providerType) throw new BillingError("invalid_payload", "Paddle event has no event_id or event_type")
  const data = payload.data
  const base = { provider: "paddle" as const, eventId, providerType, occurredAt: date(payload.occurred_at, "occurred_at"), organizationId: organizationFrom(data.custom_data, secret) }

  const reason = SUBSCRIPTION_REASONS[providerType]
  if (reason) {
    const subscription = normalizeSubscription(data, prices, base.occurredAt)
    if (!subscription) return { ...base, type: "ignored", reason: "unknown_price" }
    return { ...base, type: "subscription.updated", reason, subscription }
  }

  if (providerType === "transaction.completed" || providerType === "transaction.payment_failed" || providerType === "transaction.past_due") {
    const transactionId = str(data.id)
    if (!transactionId) throw new BillingError("invalid_payload", "Paddle transaction has no id")
    // a card change bills nothing; it isn't a payment
    if (data.origin === "subscription_payment_method_change") return { ...base, type: "ignored", reason: "payment_method_change" }
    const details = isObj(data.details) ? data.details : {}
    const totals = isObj(details.totals) ? details.totals : {}
    const failed = providerType !== "transaction.completed"
    const lastAttempt = Array.isArray(data.payments) ? data.payments.find(isObj) : undefined // newest first
    return {
      ...base,
      type: failed ? "payment.failed" : "payment.succeeded",
      transactionId,
      customerId: str(data.customer_id),
      subscriptionId: str(data.subscription_id),
      kind: kindOf(data.origin),
      amountMinor: minor(totals.grand_total ?? totals.total),
      currency: str(totals.currency_code) ?? str(data.currency_code) ?? "USD",
      invoiceNumber: str(data.invoice_number),
      errorCode: failed ? (str(lastAttempt?.error_code) ?? null) : null,
    }
  }

  if (providerType === "customer.updated") {
    const customerId = str(data.id)
    if (!customerId) throw new BillingError("invalid_payload", "Paddle customer has no id")
    return { ...base, type: "customer.updated", customerId }
  }

  return { ...base, type: "ignored", reason: "unhandled_type" }
}

function normalizeSubscription(data: Json, prices: PriceMap, occurredAt: Date): NormalizedSubscription | null {
  const id = str(data.id)
  const customerId = str(data.customer_id)
  const status = data.status as SubscriptionStatus
  if (!id || !customerId || !STATUSES.includes(status)) throw new BillingError("invalid_payload", "Paddle subscription has no id, customer or known status")

  // the first item that is one of our plan prices; anything else on it isn't ours to read
  const items = Array.isArray(data.items) ? data.items.filter(isObj) : []
  const sold = items.map((i) => (isObj(i.price) ? str(i.price.id) : null)).map((p) => (p ? planForPrice(prices, p) : null)).find((x) => x !== null)
  if (!sold) return null

  const period = isObj(data.current_billing_period) ? data.current_billing_period : null
  const currentPeriodStart = optDate(period?.starts_at, "current_billing_period.starts_at")
  const currentPeriodEnd = optDate(period?.ends_at, "current_billing_period.ends_at")

  let plan = sold.plan
  let scheduledChange: ScheduledChange | null = null
  // a downgrade made by changePlan: the items already carry the lower plan, the paid one runs on
  // until the period it was paid for ends
  const custom = isObj(data.custom_data) ? data.custom_data : {}
  const paidPlan = custom[PAID_PLAN_KEY] as PaidPlan
  const paidUntil = optDate(str(custom[PAID_UNTIL_KEY]), PAID_UNTIL_KEY)
  if (PAID_PLANS.includes(paidPlan) && rank(paidPlan) > rank(plan) && paidUntil && (currentPeriodStart ?? occurredAt) < paidUntil) {
    scheduledChange = { action: "change", plan, interval: sold.interval, effectiveAt: paidUntil.toISOString() }
    plan = paidPlan
  }

  const sc = isObj(data.scheduled_change) ? data.scheduled_change : null
  if (sc?.action === "cancel" || sc?.action === "pause")
    scheduledChange = { action: sc.action, effectiveAt: date(sc.effective_at, "scheduled_change.effective_at").toISOString() }

  return {
    provider: "paddle",
    providerSubscriptionId: id,
    customerId,
    plan,
    interval: sold.interval,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: sc?.action === "cancel",
    scheduledChange,
    providerUpdatedAt: occurredAt,
  }
}

// --- API client ---

interface PaddleTransaction {
  id: string
  status: string
  origin: string
  customer_id: string | null
  subscription_id: string | null
  invoice_number: string | null
  billed_at: string | null
  created_at: string
  currency_code: string
  details?: { totals?: { grand_total?: string; total?: string; currency_code?: string } }
  items?: { price?: { description?: string | null } | null }[]
}

interface PaddlePrice {
  id: string
  product_id: string
  name: string | null
  tax_mode: string
  billing_cycle: unknown
  unit_price: { amount: string; currency_code: string }
}

const totalOf = (t: Pick<PaddleTransaction, "details">) => minor(t.details?.totals?.grand_total ?? t.details?.totals?.total)

export function createPaddleProvider(config: PaddleConfig): BillingProvider {
  const base = API_BASE[config.environment]
  // catalog prices don't change once created; one lookup per instance
  const priceCache = new Map<string, Promise<PaddlePrice>>()

  async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
    let res: Response
    try {
      res = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Paddle-Version": "1" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw new BillingError("provider_error", `Paddle ${method} ${path.split("?")[0]} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; detail?: string }; meta?: { request_id?: string } } | null
    if (!res.ok || !json || !("data" in json)) {
      throw new BillingError("provider_error", `Paddle ${method} ${path.split("?")[0]}: ${json?.error?.detail ?? `HTTP ${res.status}`}`, {
        status: res.status,
        providerCode: json?.error?.code,
        requestId: json?.meta?.request_id,
      })
    }
    return json.data as T
  }

  const priceFor = (t: PlanTarget) => config.prices[t.plan][t.interval]
  // Paddle replaces custom_data on every update, so each write carries the signed workspace again
  const orgData = (organizationId: string) => organizationData(organizationId, config.webhookSecret)

  /** The PATCH body for moving `sub` to `target`, and when it takes effect. */
  function changeBody(sub: SubscriptionRef, target: PlanTarget) {
    const timing = changeTiming(sub, target)
    if (!timing) throw new BillingError("no_change", `The subscription is already on ${target.plan} (${target.interval})`)
    const items = [{ price_id: priceFor(target), quantity: 1 }]
    // Paddle can't defer an item change. A downgrade switches the items now without proration, billing
    // the lower price from the next renewal, and custom_data keeps the paid plan until then. A billing
    // frequency change only takes immediate modes, so a move to monthly is prorated now instead.
    if (timing === "period_end" && sub.interval === target.interval) {
      return {
        timing,
        body: {
          items,
          proration_billing_mode: "full_next_billing_period",
          custom_data: { ...orgData(sub.organizationId), [PAID_PLAN_KEY]: sub.plan, [PAID_UNTIL_KEY]: sub.currentPeriodEnd.toISOString() },
        },
      }
    }
    return {
      timing: "immediately" as const,
      // an upgrade that can't be paid isn't applied
      body: { items, proration_billing_mode: "prorated_immediately", on_payment_failure: "prevent_change", custom_data: orgData(sub.organizationId) },
    }
  }

  const subPath = (sub: SubscriptionRef) => `/subscriptions/${encodeURIComponent(sub.providerSubscriptionId)}`

  /** The subscription's one-time charge carrying `mark`, unless it was canceled. */
  async function findCharge(sub: SubscriptionRef, mark: string) {
    const q = new URLSearchParams({ subscription_id: sub.providerSubscriptionId, origin: "subscription_charge", order_by: "created_at[DESC]", per_page: "100" })
    const txns = await call<PaddleTransaction[]>("GET", `/transactions?${q}`)
    return txns.find((t) => t.status !== "canceled" && t.items?.some((i) => i.price?.description === mark)) ?? null
  }

  function catalogPrice(id: string) {
    let p = priceCache.get(id)
    if (!p) {
      p = call<PaddlePrice>("GET", `/prices/${encodeURIComponent(id)}`)
      p.catch(() => priceCache.delete(id))
      priceCache.set(id, p)
    }
    return p
  }

  return {
    id: "paddle",
    environment: config.environment,

    async findOrCreateCustomer(email) {
      const address = email.trim().toLowerCase()
      const find = async () => (await call<{ id: string }[]>("GET", `/customers?${new URLSearchParams({ email: address, status: "active" })}`))[0]?.id ?? null
      const found = await find()
      if (found) return found
      try {
        return (await call<{ id: string }>("POST", "/customers", { email: address })).id
      } catch (err) {
        // created by a concurrent checkout in between
        if (err instanceof BillingError && err.details.providerCode === "customer_already_exists") {
          const raced = await find()
          if (raced) return raced
        }
        throw err
      }
    },

    async createCheckout(org, plan, interval, opts = {}) {
      if (!UUID.test(org.id)) throw new BillingError("invalid_input", "Organization id must be a uuid")
      if (org.customerId && !CUSTOMER_ID.test(org.customerId)) throw new BillingError("invalid_input", "Not a Paddle customer id")
      // The browser gets only the transaction's id: items, workspace and customer are fixed here, and
      // Paddle.js can't change them for an existing transaction.
      const txn = await call<{ id: string }>("POST", "/transactions", {
        items: [{ price_id: config.prices[plan][interval], quantity: 1 }],
        custom_data: orgData(org.id),
        collection_mode: "automatic",
        ...(org.customerId ? { customer_id: org.customerId } : {}),
        ...(opts.discountId ? { discount_id: opts.discountId } : {}),
      })
      return {
        provider: "paddle",
        environment: config.environment,
        clientToken: config.clientToken,
        transactionId: txn.id,
        settings: { ...(opts.locale ? { locale: opts.locale } : {}), ...(opts.successUrl ? { successUrl: opts.successUrl } : {}) },
      }
    },

    async checkoutStatus(transactionId) {
      if (!TRANSACTION_ID.test(transactionId)) throw new BillingError("invalid_input", "Not a Paddle transaction id")
      const t = await call<{ status: string; subscription_id: string | null; custom_data: unknown }>("GET", `/transactions/${transactionId}`)
      return { status: t.status, subscriptionId: t.subscription_id ?? null, organizationId: organizationFrom(t.custom_data, config.webhookSecret) }
    },

    async portalUrl(customerId, subscriptionIds = []) {
      const session = await call<{ urls: { general: { overview: string } } }>("POST", `/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
        subscription_ids: subscriptionIds,
      })
      return session.urls.general.overview
    },

    async previewChange(sub, target) {
      const { timing, body } = changeBody(sub, target)
      // the preview takes the same change; custom_data doesn't affect what is billed
      const { custom_data: _, ...preview } = body
      const p = await call<{
        currency_code: string
        immediate_transaction: { details?: { totals?: { grand_total?: string } } } | null
        next_transaction: { billing_period?: { starts_at?: string }; details?: { totals?: { grand_total?: string } } } | null
        update_summary: { credit?: { amount?: string } } | null
      }>("PATCH", `${subPath(sub)}/preview`, preview, 30_000)
      return {
        timing,
        currency: p.currency_code,
        dueNowMinor: minor(p.immediate_transaction?.details?.totals?.grand_total ?? "0"),
        creditMinor: minor(p.update_summary?.credit?.amount ?? "0"),
        nextBilledAt: p.next_transaction?.billing_period?.starts_at ? new Date(p.next_transaction.billing_period.starts_at) : null,
        nextTotalMinor: p.next_transaction ? minor(p.next_transaction.details?.totals?.grand_total) : null,
      } satisfies ChangePreview
    },

    async changePlan(sub, target) {
      const { timing, body } = changeBody(sub, target)
      await call("PATCH", subPath(sub), body, 30_000)
      return { timing }
    },

    async cancelAtPeriodEnd(sub) {
      await call("POST", `${subPath(sub)}/cancel`, { effective_from: "next_billing_period" })
    },

    async resume(sub) {
      await call("PATCH", subPath(sub), { scheduled_change: null })
    },

    async createOneTimeCharge(sub, items, idempotencyKey) {
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new BillingError("invalid_input", "Idempotency key must be 1–120 of A–Z a–z 0–9 . _ : -")
      if (!items.length || items.some((i) => !Number.isSafeInteger(i.quantity) || i.quantity < 1))
        throw new BillingError("invalid_input", "A charge needs items with a whole quantity of at least 1")
      // The API takes no idempotency key, so the key travels as the internal description of a
      // non-catalog copy of each price: it is created with the charge, atomically, and a retry finds it.
      const mark = CHARGE_MARK + idempotencyKey
      const existing = await findCharge(sub, mark)
      if (existing) return { transactionId: existing.id, duplicate: true }

      const lines = []
      for (const item of items) {
        const p = await catalogPrice(item.priceId)
        if (p.billing_cycle) throw new BillingError("invalid_input", `${item.priceId} is a recurring price; one-time charges need a non-recurring one`)
        const price = { product_id: p.product_id, description: mark, name: p.name, tax_mode: p.tax_mode, unit_price: p.unit_price }
        for (let left = item.quantity; left > 0; left -= MAX_LINE_QUANTITY) lines.push({ quantity: Math.min(left, MAX_LINE_QUANTITY), price })
      }
      // a failed payment still creates the (past_due) transaction, so dunning and our grace apply (ADR 0003 (f))
      await call("POST", `${subPath(sub)}/charge`, { effective_from: "immediately", on_payment_failure: "apply_change", items: lines }, 30_000)
      const created = await findCharge(sub, mark).catch(() => null)
      return { transactionId: created?.id ?? null, duplicate: false }
    },

    async listInvoices(customerId) {
      const q = new URLSearchParams({ customer_id: customerId, status: "billed,paid,completed,past_due", order_by: "billed_at[DESC]", per_page: "50" })
      const txns = await call<PaddleTransaction[]>("GET", `/transactions?${q}`)
      return txns.map(
        (t): Invoice => ({
          id: t.id,
          number: t.invoice_number,
          status: t.status,
          kind: kindOf(t.origin),
          billedAt: t.billed_at ? new Date(t.billed_at) : null,
          totalMinor: totalOf(t),
          currency: t.details?.totals?.currency_code ?? t.currency_code,
          subscriptionId: t.subscription_id,
        }),
      )
    },

    async invoicePdfUrl(invoiceId) {
      const { url } = await call<{ url: string }>("GET", `/transactions/${encodeURIComponent(invoiceId)}/invoice?disposition=inline`)
      return url
    },

    verifyWebhook: (rawBody, headers, now) => verifyPaddleSignature(rawBody, headers, config.webhookSecret, now),

    normalizeEvent: (payload) => normalizePaddleEvent(payload, config.prices, config.webhookSecret),
  }
}
