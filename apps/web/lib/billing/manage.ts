import { getBillingCustomerId, getSubscription, setOverage, type Db, type Subscription } from "@apex/db"
import { CheckoutRefused, payingWorkspace } from "./checkout.ts"
import type { PlanChoice } from "./intent.ts"
import { TRANSACTION_ID } from "./paddle.ts"
import type { BillingProvider, ChangeTiming, Invoice, PaymentKind } from "./types.ts"

// Managing a running subscription from the billing page (app/api/billing/*). Owners and admins act;
// members may read invoices. The provider's webhook, not these calls, writes what changed
// (applyBillingEvent), so the page shows the new state once it lands.

/** The workspace's subscription, while it runs and can be changed. */
async function runningSubscription(q: Db, organizationId: string): Promise<Subscription> {
  const sub = await getSubscription(q, organizationId)
  if (!sub || (sub.status !== "active" && sub.status !== "trialing")) throw new CheckoutRefused(409, "no_subscription", "This workspace has no running subscription")
  return sub
}

/** A plan change, once nothing else is waiting for the period end (a cancellation or an earlier downgrade). */
async function changeableSubscription(q: Db, organizationId: string) {
  const sub = await runningSubscription(q, organizationId)
  if (sub.cancelAtPeriodEnd || sub.scheduledChange)
    throw new CheckoutRefused(409, "pending_change", "A change is already scheduled for the end of this period")
  return sub
}

export interface ChangePreviewJson {
  timing: ChangeTiming
  currency: string
  dueNowMinor: number
  creditMinor: number
  nextBilledAt: string | null
  nextTotalMinor: number | null
}

/** What moving to `target` would charge now and at the next renewal; changes nothing. */
export async function previewPlanChange(q: Db, provider: BillingProvider | null, userId: string, target: PlanChoice): Promise<ChangePreviewJson> {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "manage")
  const preview = await p.previewChange(await changeableSubscription(q, organization_id), target)
  return { ...preview, nextBilledAt: preview.nextBilledAt?.toISOString() ?? null }
}

export async function changePlan(q: Db, provider: BillingProvider | null, userId: string, target: PlanChoice): Promise<{ timing: ChangeTiming }> {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "manage")
  return p.changePlan(await changeableSubscription(q, organization_id), target)
}

/** The plan runs to the end of the paid period, then the workspace moves to Free. */
export async function cancelSubscription(q: Db, provider: BillingProvider | null, userId: string) {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "manage")
  const sub = await runningSubscription(q, organization_id)
  // asking twice is harmless: the cancellation stands
  if (!sub.cancelAtPeriodEnd) await p.cancelAtPeriodEnd(sub)
}

/** Takes back a cancellation at the period end. */
export async function resumeSubscription(q: Db, provider: BillingProvider | null, userId: string) {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "manage")
  const sub = await runningSubscription(q, organization_id)
  if (!sub.cancelAtPeriodEnd) throw new CheckoutRefused(409, "not_canceling", "The subscription isn't set to end")
  await p.resume(sub)
}

/** A short-lived link to the provider's portal, where the payment method is changed. */
export async function portalLink(q: Db, provider: BillingProvider | null, userId: string): Promise<string> {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "manage")
  const customerId = await getBillingCustomerId(q, organization_id)
  if (!customerId) throw new CheckoutRefused(409, "no_subscription", "This workspace hasn't paid for a plan yet")
  const sub = await getSubscription(q, organization_id)
  return p.portalUrl(customerId, sub && sub.status !== "canceled" ? [sub.providerSubscriptionId] : [])
}

/**
 * Turns overage on or off, with the monthly cap in US cents (null keeps the stored one). Turning it
 * on needs the overage price, without which it couldn't be billed.
 */
export async function updateOverage(
  q: Db,
  provider: BillingProvider | null,
  overageBillable: boolean,
  userId: string,
  input: { enabled: boolean; capCents: number | null },
) {
  const { organization_id } = await payingWorkspace(q, userId, provider, "manage")
  if (input.enabled && !overageBillable) throw new CheckoutRefused(409, "overage_unavailable", "Paid extra replies aren't available yet")
  const result = await q.transaction((tx) => setOverage(tx, { organizationId: organization_id, actorId: userId, ...input }))
  if (!result.ok) {
    const message = { invalid_cap: "Choose a cap in steps of $5", plan_has_no_overage: "Your plan has no paid extra replies", no_subscription: "Paid extra replies need a running subscription" }
    throw new CheckoutRefused(result.reason === "invalid_cap" ? 400 : 409, result.reason, message[result.reason])
  }
}

export interface InvoiceJson {
  id: string
  number: string | null
  status: string
  kind: PaymentKind
  billedAt: string | null
  totalMinor: number
  currency: string
}

/** The workspace's invoices, newest first; any member can read the list. */
export async function workspaceInvoices(q: Db, provider: BillingProvider | null, userId: string): Promise<InvoiceJson[]> {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "read", true)
  const customerId = await getBillingCustomerId(q, organization_id)
  if (!customerId) return []
  return (await p.listInvoices(customerId)).map(({ subscriptionId: _, ...i }) => ({ ...i, billedAt: i.billedAt?.toISOString() ?? null }))
}

/**
 * A link to one of the workspace's invoice PDFs, for owners and admins (it carries the payer's
 * address and tax details). The provider would hand out any customer's: the id must be on our list.
 */
export async function invoicePdf(q: Db, provider: BillingProvider | null, userId: string, invoiceId: string): Promise<string> {
  const { organization_id, provider: p } = await payingWorkspace(q, userId, provider, "read")
  if (!TRANSACTION_ID.test(invoiceId)) throw new CheckoutRefused(404, "not_found", "Invoice not found")
  const customerId = await getBillingCustomerId(q, organization_id)
  const invoices: Invoice[] = customerId ? await p.listInvoices(customerId) : []
  if (!invoices.some((i) => i.id === invoiceId)) throw new CheckoutRefused(404, "not_found", "Invoice not found")
  return p.invoicePdfUrl(invoiceId)
}
