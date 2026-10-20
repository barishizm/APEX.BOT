import { errorJson, readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { getBillingProvider } from "@/lib/billing"
import { startCheckout } from "@/lib/billing/checkout"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { parsePlanChoice } from "@/lib/billing/intent"
import { db } from "@/lib/db"
import { requestLocale } from "@/lib/i18n/server"

// Body: { plan: "starter" | "pro" | "business", interval: "month" | "year" }. Owners and admins only.
// Answers what Paddle.js needs to open the overlay for a transaction made here (lib/billing/checkout.ts).
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const b = await readJson(request)
    const choice = parsePlanChoice(b.plan, b.interval)
    if (!choice) return errorJson("invalid_input", "Choose a plan and how often to pay", { status: 400 })
    return Response.json(await startCheckout(db(), getBillingProvider(), user, choice, await requestLocale()))
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
