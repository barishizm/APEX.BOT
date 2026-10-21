import { AdminError } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"
import { getBillingProvider } from "@/lib/billing"
import { sendBillingNoticesFor } from "@/lib/billing/notices"
import { replayBillingEvent } from "@/lib/billing/webhook"
import { db } from "@/lib/db"

// POST /api/admin/billing/<action>, body { reason, … }: what staff do from /admin/billing. Each one
// is audited with its reason and needs a recent step-up.

type Params = { action: string }
type Ctx = AdminActionContext<Params>

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  // a webhook left unprocessed, applied again (lib/billing/webhook.ts); body { eventId }
  "webhook-replay": withAdminAction<Params>({ action: "billing.webhook_replay", targetType: "billing_event" }, async ({ tx, body }: Ctx) => {
    const provider = getBillingProvider()
    if (!provider) throw new AdminError("invalid_input", "Billing is not configured")
    const id = typeof body.eventId === "string" ? body.eventId : ""
    const r = await replayBillingEvent(tx, provider, id)
    return {
      targetId: id,
      before: { processed: false },
      after: { outcome: r.outcome, attempts: r.attempts, error: r.error },
      result: { outcome: r.outcome, error: r.error },
      afterCommit: r.changed.length ? () => sendBillingNoticesFor(db(), r.changed) : undefined,
    }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
