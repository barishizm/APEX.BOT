import type { Metadata } from "next"
import { getBillingCustomerId, getSubscription, membership, workspacePlan, workspaceReplyUsage } from "@apex/db"
import { BillingPanel } from "@/components/billing/billing-panel"
import { DashboardFrame } from "@/components/dashboard/frame"
import { requireVerifiedUser } from "@/lib/auth"
import { billingStatus } from "@/lib/billing"
import { canPay } from "@/lib/billing/checkout"
import { parsePlanChoice } from "@/lib/billing/intent"
import { billingLive } from "@/lib/billing/live"
import { TRANSACTION_ID } from "@/lib/billing/paddle"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).billing.title }
}

type Search = { plan?: string | string[]; interval?: string | string[]; checkout?: string | string[] }

// ?plan=pro&interval=year comes from the pricing page and offers that plan; ?checkout=<transaction>
// is where the overlay returns, to follow the payment until the webhook lands. Every member sees the
// page; only owners and admins get its controls (canPay), and the API holds them to that as well.
export default async function BillingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireVerifiedUser()
  const q = db()
  const member = await membership(q, user.id)
  const org = member.organization_id
  const [live, plan, sub, usage, customerId] = await Promise.all([
    billingLive(org),
    workspacePlan(q, org),
    getSubscription(q, org),
    workspaceReplyUsage(q, org),
    getBillingCustomerId(q, org),
  ])
  const status = billingStatus()
  const search = await searchParams
  const checkout = typeof search.checkout === "string" && TRANSACTION_ID.test(search.checkout) ? search.checkout : null
  return (
    <DashboardFrame active="Billing">
      <BillingPanel
        live={live}
        canPay={canPay(member.role)}
        plan={plan.plan}
        subscription={
          sub && sub.status !== "canceled"
            ? {
                plan: sub.plan,
                interval: sub.interval,
                status: sub.status,
                periodEnd: sub.currentPeriodEnd.toISOString(),
                endsAtPeriodEnd: sub.cancelAtPeriodEnd,
                graceUntil: sub.graceUntil?.toISOString() ?? null,
                scheduledChange: sub.scheduledChange,
              }
            : null
        }
        usage={
          usage && {
            usedFifths: usage.usedFifths,
            allowanceFifths: usage.allowanceFifths,
            resetsAt: usage.window.end.toISOString(),
            enforced: usage.enforced,
            overage: { ...usage.overage, billable: status.enabled && status.overage },
          }
        }
        hasCustomer={!!customerId}
        choice={parsePlanChoice(search.plan, search.interval)}
        checkoutId={checkout}
      />
    </DashboardFrame>
  )
}
