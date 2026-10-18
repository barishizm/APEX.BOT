import type { Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import { FEATURE_FLAGS, FEATURE_FLAG_NAMES, isFeatureFlag, type FeatureFlag } from "./flags.ts"

export * from "./flags.ts"

// Platform-wide settings staff change at runtime (/admin/settings), stored in app.platform_settings:
//
//   signups_mode        "open" | "invite_only" | "closed"; no row means the deployment's default
//                       (SIGNUPS_MODE in the environment), so a fresh database behaves as configured
//   flags.<name>        { enabled, workspaces: { <organization id>: boolean } } — the flag for
//                       everyone, and the workspaces where staff turned it the other way
//
// Every request reads them (sign-up, the chat API, the dashboard), so reads go through a cache
// that keeps them for SETTINGS_CACHE_MS per process. A change shows up everywhere within that
// time; the process that made it clears its own copy at once.

export const SIGNUPS_MODES = ["open", "invite_only", "closed"] as const
export type SignupsMode = (typeof SIGNUPS_MODES)[number]
export const isSignupsMode = (v: unknown): v is SignupsMode => SIGNUPS_MODES.includes(v as SignupsMode)

export interface FlagState {
  enabled: boolean
  /** Workspaces where the flag differs from `enabled`, by organization id. */
  workspaces: Record<string, boolean>
}

export interface PlatformSettings {
  /** null: not set by staff, the deployment's default applies. */
  signupsMode: SignupsMode | null
  flags: Record<FeatureFlag, FlagState>
}

export const SETTINGS_CACHE_MS = 30_000
const SIGNUPS_KEY = "signups_mode"
const FLAG_PREFIX = "flags."
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------- the cache ----------

// One entry per database handle and name. The promise is kept, so concurrent requests share one
// query; a failed read is dropped at once so the next request tries again.
const entries = new Map<Queryable, Map<string, { at: number; value: Promise<unknown> }>>()

/** `load(q)`, remembered for `ttlMs` per database handle under `name`. */
export function cachedRead<T>(q: Queryable, name: string, load: (q: Queryable) => Promise<T>, ttlMs = SETTINGS_CACHE_MS, now = Date.now()): Promise<T> {
  let byName = entries.get(q)
  if (!byName) entries.set(q, (byName = new Map()))
  const hit = byName.get(name)
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>
  const value = load(q)
  const entry = { at: now, value }
  byName.set(name, entry)
  value.catch(() => byName.get(name) === entry && byName.delete(name))
  return value
}

/** Forgets every cached read in this process, e.g. right after staff changed a setting. */
export function clearSettingsCache() {
  entries.clear()
}

// ---------- reading ----------

function toFlagState(flag: FeatureFlag, raw: unknown): FlagState {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const workspaces: Record<string, boolean> = {}
  if (value.workspaces && typeof value.workspaces === "object") {
    for (const [id, on] of Object.entries(value.workspaces as Record<string, unknown>)) {
      if (UUID_RE.test(id) && typeof on === "boolean") workspaces[id.toLowerCase()] = on
    }
  }
  return { enabled: typeof value.enabled === "boolean" ? value.enabled : FEATURE_FLAGS[flag].default, workspaces }
}

/** The settings as stored now, without the cache. Unknown keys and malformed values are ignored. */
export async function readPlatformSettings(q: Queryable): Promise<PlatformSettings> {
  const { rows } = await q.query<{ key: string; value: unknown }>(
    "select key, value from app.platform_settings where key = $1 or starts_with(key, $2)",
    [SIGNUPS_KEY, FLAG_PREFIX],
  )
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const mode = stored.get(SIGNUPS_KEY)
  return {
    signupsMode: isSignupsMode(mode) ? mode : null,
    flags: Object.fromEntries(FEATURE_FLAG_NAMES.map((f) => [f, toFlagState(f, stored.get(`${FLAG_PREFIX}${f}`))])) as Record<FeatureFlag, FlagState>,
  }
}

/** The settings, at most SETTINGS_CACHE_MS old. */
export const platformSettings = (q: Queryable) => cachedRead(q, "platform_settings", readPlatformSettings)

/** Whether the flag is on, for a workspace when one is given (its own setting wins over the global one). */
export function flagEnabled(settings: PlatformSettings, flag: FeatureFlag, organizationId?: string | null): boolean {
  const state = settings.flags[flag]
  const own = organizationId ? state.workspaces[organizationId.toLowerCase()] : undefined
  return own ?? state.enabled
}

/** flagEnabled over the cached settings. */
export async function featureEnabled(q: Queryable, flag: FeatureFlag, organizationId?: string | null): Promise<boolean> {
  return flagEnabled(await platformSettings(q), flag, organizationId)
}

// ---------- changing (in withAdminAction's transaction) ----------

async function lockSetting(tx: Queryable, key: string): Promise<unknown> {
  // serializes two staff changing the same setting, also before its row exists
  await tx.query("select pg_advisory_xact_lock(hashtext('apex.platform_settings'), hashtext($1))", [key])
  const { rows } = await tx.query<{ value: unknown }>("select value from app.platform_settings where key = $1", [key])
  return rows[0]?.value
}

async function writeSetting(tx: Queryable, actorId: string, key: string, value: unknown) {
  await tx.query(
    `insert into app.platform_settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
    [key, JSON.stringify(value), actorId],
  )
}

/** Sets the sign-up mode. `before` is null when no mode had been set (the default applied). */
export async function setSignupsMode(tx: Queryable, actorId: string, raw: unknown): Promise<ActionChange> {
  if (!isSignupsMode(raw)) throw new AdminError("invalid_input", "Choose a sign-up mode")
  const stored = await lockSetting(tx, SIGNUPS_KEY)
  const before = isSignupsMode(stored) ? stored : null
  if (before === raw) throw new AdminError("invalid_input", "Sign-ups are already set that way")
  await writeSetting(tx, actorId, SIGNUPS_KEY, raw)
  return { before: { signupsMode: before }, after: { signupsMode: raw }, extra: {} }
}

/**
 * Turns a flag on or off for everyone, or for one workspace. For a workspace, `enabled: null`
 * removes its own setting so it follows the global one again.
 */
export async function setFeatureFlag(
  tx: Queryable,
  actorId: string,
  rawFlag: unknown,
  input: { enabled: unknown; organizationId?: unknown },
): Promise<ActionChange<{ flag: FeatureFlag }>> {
  if (!isFeatureFlag(rawFlag)) throw new AdminError("invalid_input", "Unknown feature flag")
  const flag = rawFlag
  const key = `${FLAG_PREFIX}${flag}`
  const state = toFlagState(flag, await lockSetting(tx, key))
  const before: FlagState = { enabled: state.enabled, workspaces: { ...state.workspaces } }

  const org = input.organizationId
  if (org === undefined || org === null || org === "") {
    if (typeof input.enabled !== "boolean") throw new AdminError("invalid_input", "Turn the flag on or off")
    if (state.enabled === input.enabled) throw new AdminError("invalid_input", "The flag is already set that way")
    state.enabled = input.enabled
  } else {
    if (typeof org !== "string" || !UUID_RE.test(org)) throw new AdminError("invalid_input", "Workspace not found")
    const id = org.toLowerCase()
    const { rows } = await tx.query("select 1 from app.organizations where id = $1", [id])
    if (!rows.length) throw new AdminError("not_found", "Workspace not found")
    if (input.enabled === null) {
      if (!(id in state.workspaces)) throw new AdminError("invalid_input", "This workspace has no setting of its own")
      delete state.workspaces[id]
    } else {
      if (typeof input.enabled !== "boolean") throw new AdminError("invalid_input", "Turn the flag on or off")
      if (state.workspaces[id] === input.enabled) throw new AdminError("invalid_input", "The flag is already set that way")
      state.workspaces[id] = input.enabled
    }
  }
  await writeSetting(tx, actorId, key, state)
  return { before: { flag, ...before }, after: { flag, ...state }, extra: { flag } }
}

// ---------- the admin page ----------

export interface FlagOverview {
  flag: FeatureFlag
  default: boolean
  enabled: boolean
  /** Whether staff ever set it; false means it has its default. */
  stored: boolean
  updatedAt: Date | null
  workspaces: { organizationId: string; name: string; plan: string; enabled: boolean }[]
}

/** The sign-up mode and every flag with its workspace settings, uncached, for /admin/settings. */
export async function settingsOverview(q: Queryable): Promise<{ signupsMode: SignupsMode | null; signupsUpdatedAt: Date | null; flags: FlagOverview[] }> {
  const settings = await readPlatformSettings(q)
  const { rows } = await q.query<{ key: string; updated_at: Date }>(
    "select key, updated_at from app.platform_settings where key = $1 or starts_with(key, $2)",
    [SIGNUPS_KEY, FLAG_PREFIX],
  )
  const updated = new Map(rows.map((r) => [r.key, r.updated_at]))
  const ids = [...new Set(FEATURE_FLAG_NAMES.flatMap((f) => Object.keys(settings.flags[f].workspaces)))]
  const orgs = ids.length
    ? (await q.query<{ id: string; name: string; plan: string }>("select id, name, plan from app.organizations where id = any($1::uuid[])", [ids])).rows
    : []
  const byId = new Map(orgs.map((o) => [o.id, o]))
  return {
    signupsMode: settings.signupsMode,
    signupsUpdatedAt: updated.get(SIGNUPS_KEY) ?? null,
    flags: FEATURE_FLAG_NAMES.map((flag) => ({
      flag,
      default: FEATURE_FLAGS[flag].default,
      enabled: settings.flags[flag].enabled,
      stored: updated.has(`${FLAG_PREFIX}${flag}`),
      updatedAt: updated.get(`${FLAG_PREFIX}${flag}`) ?? null,
      workspaces: Object.entries(settings.flags[flag].workspaces)
        // a deleted workspace's setting does nothing; it is left out
        .filter(([id]) => byId.has(id))
        .map(([id, enabled]) => ({ organizationId: id, name: byId.get(id)!.name, plan: byId.get(id)!.plan, enabled }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })),
  }
}
