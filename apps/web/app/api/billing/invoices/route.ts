import { requireApiUser } from "@/lib/bot"
import { getBillingProvider } from "@/lib/billing"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { workspaceInvoices } from "@/lib/billing/manage"
import { db } from "@/lib/db"

// { invoices }: the workspace's invoices from Paddle, newest first. Any member can read the list.
export async function GET() {
  try {
    const user = await requireApiUser()
    return Response.json({ invoices: await workspaceInvoices(db(), getBillingProvider(), user.id) }, { headers: { "cache-control": "no-store" } })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
