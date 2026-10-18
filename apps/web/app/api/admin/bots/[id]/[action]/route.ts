import {
  adminClearTokenBudgetOverride,
  adminDisableBot,
  adminEnableBot,
  adminRepairBotSettings,
  adminResetHandoffEmail,
  adminRotateBotSiteKey,
  adminSetTokenBudgetOverride,
  closeSupportAccess,
  openSupportAccess,
  SUPPORT_ACCESS_MINUTES,
} from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"
import { isLocale } from "@/lib/i18n/config"
import { requestLocale } from "@/lib/i18n/server"
import { sendSupportAccessNotice } from "@/lib/mail"

// POST /api/admin/bots/<id>/<action>, body { reason, … }. Every action is audited with its reason
// against the bot (target "bot"). Those that change the bot's row need a recent step-up, and the
// chat API's sync applies them within one interval (30 s). Support access changes nothing of the
// bot's: it lets this staff member read its conversations for an hour (support-access.ts).

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

// Support access: body { reason, ticket?, locale? }. No step-up, as it destroys nothing; the reason,
// the audit entry and the email to every workspace owner (in `locale`) are what guard it.
ACTIONS["support-access"] = withAdminAction<Params>({ action: "bot.support_access.open", targetType: "bot", stepUp: false }, async ({ tx, admin, params, body, reason }: Ctx) => {
  const opened = await openSupportAccess(tx, admin.user.id, params.id, reason, body.ticket)
  const { grant } = opened
  const locale = isLocale(body.locale) ? body.locale : await requestLocale()
  const mail = { site: opened.bot.name, workspace: opened.bot.organizationName, reason, ticket: grant.ticketRef, minutes: SUPPORT_ACCESS_MINUTES }
  return {
    targetId: params.id,
    before: opened.replaced ? { grantId: opened.replaced } : null,
    // how many owners were told, not who: the audit log keeps no customer addresses
    after: { grantId: grant.id, ticketRef: grant.ticketRef, expiresAt: grant.expiresAt.toISOString(), ownersNotified: opened.owners.length, locale },
    result: { expiresAt: grant.expiresAt.toISOString() },
    afterCommit: async () => {
      await Promise.all(opened.owners.map((email) => sendSupportAccessNotice(email, mail, locale)))
    },
  }
})

ACTIONS["support-access-close"] = withAdminAction<Params>(
  { action: "bot.support_access.close", targetType: "bot", stepUp: false, reason: false },
  async ({ tx, admin, params }: Ctx) => {
    const closed = await closeSupportAccess(tx, admin.user.id, params.id)
    return { targetId: params.id, before: closed && { grantId: closed.id }, after: null }
  },
)

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
