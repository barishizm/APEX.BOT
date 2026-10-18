import { createAuthBlock, liftAuthBlock, resetThrottle } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"

// POST /api/admin/security/<action>, body { reason, … }. Audited like every admin action (lib/admin.ts).
// Ending a user's sessions is /api/admin/users/<id>/revoke-sessions.

type Params = { action: string }
type Ctx = AdminActionContext<Params>

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  // body { kind: "ip" | "email", value, minutes }; locks someone out, so it needs a step-up
  block: withAdminAction<Params>({ action: "security.block", targetType: "auth_block" }, async ({ tx, admin, body, reason, meta }: Ctx) => {
    const { block } = await createAuthBlock(tx, { id: admin.user.id, ip: meta.ip }, { kind: body.kind, value: body.value, minutes: body.minutes, reason })
    return {
      targetId: block.id,
      before: null,
      after: { kind: block.kind, value: block.value, expiresAt: block.expiresAt.toISOString() },
      result: { block },
    }
  }),

  // body { id }
  unblock: withAdminAction<Params>({ action: "security.unblock", targetType: "auth_block", stepUp: false }, async ({ tx, admin, body }: Ctx) => {
    const { block } = await liftAuthBlock(tx, admin.user.id, body.id)
    return { targetId: String(body.id), before: { ...block, expiresAt: block.expiresAt.toISOString() }, after: { lifted: true } }
  }),

  // body { kind: "ip" | "email", value }; only helps someone back in, so no step-up
  "reset-throttle": withAdminAction<Params>(
    { action: "security.reset_throttle", targetType: "throttle", stepUp: false },
    async ({ tx, admin, body }: Ctx) => {
      const reset = await resetThrottle(tx, admin.user.id, body.kind, body.value)
      return { targetId: reset.value, before: { failures: reset.cleared }, after: { failures: 0 }, result: reset }
    },
  ),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
