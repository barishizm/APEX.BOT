import { after } from "next/server"
import { requestMeta } from "@/lib/auth"
import { getBillingProvider } from "@/lib/billing"
import { sendBillingNoticesFor } from "@/lib/billing/notices"
import { handleBillingWebhook } from "@/lib/billing/webhook"
import { db } from "@/lib/db"

// Paddle's notification destination (lib/billing/webhook.ts). No session: the Paddle-Signature is the
// only credential. Room for processing that `after` finishes past the 5-second answer.
export const maxDuration = 30

export async function POST(request: Request) {
  const { ip } = await requestMeta()
  return handleBillingWebhook(request, {
    db: db(),
    provider: getBillingProvider(),
    ip: ip ?? null,
    defer: (work) => after(() => work),
    notify: (organizationId) => sendBillingNoticesFor(db(), [organizationId]),
  })
}
