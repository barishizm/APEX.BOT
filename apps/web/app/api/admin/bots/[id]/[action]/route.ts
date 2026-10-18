import {
  adminClearTokenBudgetOverride,
  adminDisableBot,
  adminEnableBot,
  adminRepairBotSettings,
  adminResetHandoffEmail,
  adminRotateBotSiteKey,
  adminSetTokenBudgetOverride,
} from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"

// POST /api/admin/bots/<id>/<action>, body { reason, … }. Every action is audited with its reason
// against the bot (target "bot") and needs a recent step-up. Each one changes the bot's row, so the
// chat API's sync applies it within one interval (30 s).

type Params = { id: string; action: string }
type Ctx = AdminActionContext<Params>

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  // body.version: the settings version whose problems the page showed
  repair: withAdminAction<Params>({ action: "bot.repair_settings", targetType: "bot" }, async ({ tx, params, body }: Ctx) => {
    const c = await adminRepairBotSettings(tx, params.id, body.version)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),

  "rotate-key": withAdminAction<Params>({ action: "bot.rotate_site_key", targetType: "bot" }, async ({ tx, params }: Ctx) => {
    const c = await adminRotateBotSiteKey(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),

  disable: withAdminAction<Params>({ action: "bot.disable", targetType: "bot" }, async ({ tx, params, reason }: Ctx) => {
    const c = await adminDisableBot(tx, params.id, reason)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  enable: withAdminAction<Params>({ action: "bot.enable", targetType: "bot" }, async ({ tx, params }: Ctx) => {
    const c = await adminEnableBot(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  // body { tokens, hours }
  "budget-override": withAdminAction<Params>({ action: "bot.budget_override", targetType: "bot" }, async ({ tx, params, body }: Ctx) => {
    const c = await adminSetTokenBudgetOverride(tx, params.id, body.tokens, body.hours)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),

  "budget-clear": withAdminAction<Params>({ action: "bot.budget_override_clear", targetType: "bot" }, async ({ tx, params }: Ctx) => {
    const c = await adminClearTokenBudgetOverride(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "handoff-reset": withAdminAction<Params>({ action: "bot.handoff_reset", targetType: "bot" }, async ({ tx, params }: Ctx) => {
    const c = await adminResetHandoffEmail(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
