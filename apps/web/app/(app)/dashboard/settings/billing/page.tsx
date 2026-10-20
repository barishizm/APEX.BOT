import type { Metadata } from "next"
import { getSubscription, membership, workspacePlan } from "@apex/db"
import { BillingPanel } from "@/components/billing/billing-panel"
import { DashboardFrame } from "@/components/dashboard/frame"
import { requireVerifiedUser } from "@/lib/auth"
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
// is where the overlay returns, to follow the payment until the webhook lands.
export default async function BillingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireVerifiedUser()
  const q = db()
  const member = await membership(q, user.id)
  const [live, plan, sub] = await Promise.all([billingLive(member.organization_id), workspacePlan(q, member.organization_id), getSubscription(q, member.organization_id)])
  const search = await searchParams
  const checkout = typeof search.checkout === "string" && TRANSACTION_ID.test(search.checkout) ? search.checkout : null
  return (
    <DashboardFrame active="Settings">
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
              }
            : null
        }
        choice={parsePlanChoice(search.plan, search.interval)}
        checkoutId={checkout}
      />
    </DashboardFrame>
  )
}
