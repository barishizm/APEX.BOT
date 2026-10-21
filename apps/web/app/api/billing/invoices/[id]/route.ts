import { requireApiUser } from "@/lib/bot"
import { getBillingProvider } from "@/lib/billing"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { invoicePdf } from "@/lib/billing/manage"
import { db } from "@/lib/db"

// Redirects to the invoice's PDF on Paddle (a link that expires within the hour). Owners and admins only.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    const url = await invoicePdf(db(), getBillingProvider(), user.id, id)
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
