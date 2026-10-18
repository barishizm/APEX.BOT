import { clearSettingsCache, setFeatureFlag, setSignupsMode } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"

// POST /api/admin/settings/<action>, body { reason, … }. Platform-wide switches: superadmins only,
// with a step-up. This process forgets its cached settings at once; other servers (and the chat
// API) pick the change up within 30 seconds (SETTINGS_CACHE_MS).
//
//   signups  { mode: "open" | "invite_only" | "closed" }
//   flag     { flag, enabled: boolean } for everyone, or { flag, organizationId, enabled: boolean | null }
//            for one workspace (null: follow the global setting again)

type Params = { action: string }
type Ctx = AdminActionContext<Params>

const options = (action: string) => ({ action, targetType: "setting", minRole: "superadmin" as const })

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  signups: withAdminAction<Params>(options("settings.signups_mode"), async ({ tx, admin, body }: Ctx) => {
    const c = await setSignupsMode(tx, admin.user.id, body.mode)
    return { targetId: "signups_mode", before: c.before, after: c.after, afterCommit: async () => clearSettingsCache() }
  }),

  flag: withAdminAction<Params>(options("settings.flag"), async ({ tx, admin, body }: Ctx) => {
    const c = await setFeatureFlag(tx, admin.user.id, body.flag, { enabled: body.enabled, organizationId: body.organizationId })
    return { targetId: `flags.${c.extra.flag}`, before: c.before, after: c.after, afterCommit: async () => clearSettingsCache() }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
