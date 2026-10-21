import { errorJson, readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { billingStatus, getBillingProvider } from "@/lib/billing"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { updateOverage } from "@/lib/billing/manage"
import { db } from "@/lib/db"

// Body: { enabled: boolean, capCents?: number }. Paid extra replies past the plan's allowance, up to
// the monthly cap (whole $5 blocks); owners and admins only.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const b = await readJson(request)
    if (typeof b.enabled !== "boolean" || (b.capCents !== undefined && b.capCents !== null && typeof b.capCents !== "number"))
      return errorJson("invalid_input", "Say whether paid extra replies are on, and their cap", { status: 400 })
    const status = billingStatus()
    await updateOverage(db(), getBillingProvider(), status.enabled && status.overage, user.id, { enabled: b.enabled, capCents: (b.capCents as number | undefined) ?? null })
    return new Response(null, { status: 204 })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
