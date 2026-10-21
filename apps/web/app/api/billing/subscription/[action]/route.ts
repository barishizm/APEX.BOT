import { errorJson, readJson } from "@/lib/auth"
import { requireApiUser } from "@/lib/bot"
import { getBillingProvider } from "@/lib/billing"
import { checkoutErrorResponse } from "@/lib/billing/checkout-response"
import { parsePlanChoice } from "@/lib/billing/intent"
import { cancelSubscription, changePlan, previewPlanChange, resumeSubscription } from "@/lib/billing/manage"
import { db } from "@/lib/db"

// The running subscription, owners and admins only (lib/billing/manage.ts):
//   preview, change  body { plan, interval }: what the move costs / make it
//   cancel, resume   no body: end at the period end / take that back
// The webhook stores what changed; the billing page refreshes until it shows.
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const user = await requireApiUser()
    const { action } = await params
    const q = db()
    const provider = getBillingProvider()
    if (action === "preview" || action === "change") {
      const b = await readJson(request)
      const target = parsePlanChoice(b.plan, b.interval)
      if (!target) return errorJson("invalid_input", "Choose a plan and how often to pay", { status: 400 })
      return Response.json(action === "preview" ? await previewPlanChange(q, provider, user.id, target) : await changePlan(q, provider, user.id, target))
    }
    if (action === "cancel") await cancelSubscription(q, provider, user.id)
    else if (action === "resume") await resumeSubscription(q, provider, user.id)
    else return errorJson("not_found", "Unknown action", { status: 404 })
    return new Response(null, { status: 204 })
  } catch (err) {
    return checkoutErrorResponse(err)
  }
}
