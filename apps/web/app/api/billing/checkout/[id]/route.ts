import { requireApiUser } from "@/lib/bot"
import { getBillingProvider } from "@/lib/billing"
import { checkoutState } from "@/lib/billing/checkout"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { db } from "@/lib/db"

// The billing page polls this after Paddle's checkout completes, until the webhook has stored the
// subscription: { state: "processing" | "active" | "failed", plan }.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const { id } = await params
    return Response.json(await checkoutState(db(), getBillingProvider(), user.id, id), { headers: { "cache-control": "no-store" } })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
