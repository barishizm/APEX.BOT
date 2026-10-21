import { requireApiUser } from "@/lib/bot"
import { getBillingProvider } from "@/lib/billing"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { portalLink } from "@/lib/billing/manage"
import { db } from "@/lib/db"

// { url }: a short-lived link to Paddle's customer portal, where the payment method is updated.
// A POST, since it opens a session that can change billing; owners and admins only.
export async function POST() {
  try {
    const user = await requireApiUser()
    return Response.json({ url: await portalLink(db(), getBillingProvider(), user.id) }, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
