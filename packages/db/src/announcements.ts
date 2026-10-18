import type { Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import { cachedRead } from "./platform-settings.ts"
import { PLANS, type Plan } from "./plans.ts"

// Announcement and maintenance banners (/admin/announcements). Staff write the text in each
// language, pick a level, a time window and who sees it: everyone, workspaces on some plans, or
// chosen workspaces. The dashboard shows the ones meant for the viewer's workspace; announcements
// to everyone can also go on the public site. Closing a banner is remembered by the browser.

export const ANNOUNCEMENT_LEVELS = ["info", "warn", "critical"] as const
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number]
export const ANNOUNCEMENT_AUDIENCES = ["all", "plan", "workspace"] as const
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number]
export const ANNOUNCEMENT_LOCALES = ["en", "tr", "lt", "lv", "et"] as const
export type AnnouncementLocale = (typeof ANNOUNCEMENT_LOCALES)[number]

export const ANNOUNCEMENT_LIMITS = { message: 500, workspaces: 100 } as const

export interface Announcement {
  id: string
  level: AnnouncementLevel
  /** English always; the other languages when staff wrote them. */
  message: Partial<Record<AnnouncementLocale, string>> & { en: string }
  startsAt: Date
  endsAt: Date | null
  audience: AnnouncementAudience
  plans: Plan[]
  organizationIds: string[]
  /** Also on the public site (only for audience "all"). */
  marketing: boolean
  dismissible: boolean
  createdAt: Date
  updatedAt: Date
}

interface Row {
  id: string
  level: AnnouncementLevel
  message: Record<string, unknown>
  starts_at: Date
  ends_at: Date | null
  audience: AnnouncementAudience
  plans: string[]
  organization_ids: string[]
  marketing: boolean
  dismissible: boolean
  created_at: Date
  updated_at: Date
}

const COLUMNS = "id, level, message, starts_at, ends_at, audience, plans, organization_ids::text[] as organization_ids, marketing, dismissible, created_at, updated_at"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toAnnouncement(r: Row): Announcement {
  const message = { en: String(r.message.en ?? "") } as Announcement["message"]
  for (const l of ANNOUNCEMENT_LOCALES) if (typeof r.message[l] === "string" && r.message[l]) message[l] = r.message[l] as string
  return {
    id: r.id,
    level: r.level,
    message,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    audience: r.audience,
    plans: r.plans.filter((p): p is Plan => PLANS.includes(p as Plan)),
    organizationIds: r.organization_ids,
    marketing: r.marketing,
    dismissible: r.dismissible,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** The text in this language, or the English one. */
export const announcementText = (a: Pick<Announcement, "message">, locale: string): string => a.message[locale as AnnouncementLocale] ?? a.message.en

export type AnnouncementStatus = "scheduled" | "active" | "ended"
export function announcementStatus(a: Pick<Announcement, "startsAt" | "endsAt">, now = Date.now()): AnnouncementStatus {
  if (a.endsAt && a.endsAt.getTime() <= now) return "ended"
  return a.startsAt.getTime() > now ? "scheduled" : "active"
}

// ---------- input ----------

export interface AnnouncementInput {
  level: AnnouncementLevel
  message: Announcement["message"]
  startsAt: Date
  endsAt: Date | null
  audience: AnnouncementAudience
  plans: Plan[]
  organizationIds: string[]
  marketing: boolean
  dismissible: boolean
}

const invalid = (message: string) => new AdminError("invalid_input", message)

function toDate(raw: unknown, message: string): Date {
  const date = raw instanceof Date ? raw : typeof raw === "string" && raw ? new Date(raw) : null
  if (!date || Number.isNaN(date.getTime())) throw invalid(message)
  return date
}

/** Checks what staff sent and returns it in stored form. Workspace ids are checked against the database. */
export async function cleanAnnouncement(q: Queryable, raw: Record<string, unknown>, now = new Date()): Promise<AnnouncementInput> {
  if (!ANNOUNCEMENT_LEVELS.includes(raw.level as AnnouncementLevel)) throw invalid("Choose a level")
  const level = raw.level as AnnouncementLevel

  const texts = raw.message && typeof raw.message === "object" ? (raw.message as Record<string, unknown>) : {}
  const message: Partial<Record<AnnouncementLocale, string>> = {}
  for (const l of ANNOUNCEMENT_LOCALES) {
    const text = typeof texts[l] === "string" ? (texts[l] as string).replace(/\s+/g, " ").trim() : ""
    if (text.length > ANNOUNCEMENT_LIMITS.message) throw invalid("A message can be at most 500 characters")
    if (text) message[l] = text
  }
  if (!message.en) throw invalid("Write the message in English")

  const startsAt = raw.startsAt === undefined || raw.startsAt === null || raw.startsAt === "" ? now : toDate(raw.startsAt, "Choose when it starts")
  const endsAt = raw.endsAt === undefined || raw.endsAt === null || raw.endsAt === "" ? null : toDate(raw.endsAt, "Choose when it ends")
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw invalid("It must end after it starts")

  if (!ANNOUNCEMENT_AUDIENCES.includes(raw.audience as AnnouncementAudience)) throw invalid("Choose who sees it")
  const audience = raw.audience as AnnouncementAudience

  let plans: Plan[] = []
  let organizationIds: string[] = []
  if (audience === "plan") {
    if (!Array.isArray(raw.plans) || raw.plans.some((p) => !PLANS.includes(p as Plan))) throw invalid("Choose at least one plan")
    plans = PLANS.filter((p) => (raw.plans as unknown[]).includes(p))
    if (!plans.length) throw invalid("Choose at least one plan")
  }
  if (audience === "workspace") {
    const ids = Array.isArray(raw.organizationIds) ? [...new Set(raw.organizationIds.map((id) => (typeof id === "string" ? id.trim().toLowerCase() : "")))] : []
    if (!ids.length || ids.some((id) => !UUID_RE.test(id))) throw invalid("Choose at least one workspace")
    if (ids.length > ANNOUNCEMENT_LIMITS.workspaces) throw invalid("Choose at most 100 workspaces")
    const { rows } = await q.query<{ id: string }>("select id from app.organizations where id = any($1::uuid[])", [ids])
    if (rows.length !== ids.length) throw invalid("One of the workspaces doesn't exist")
    organizationIds = ids
  }

  const marketing = raw.marketing === true
  if (marketing && audience !== "all") throw invalid("Only an announcement to everyone can be shown on the website")
  return { level, message: message as Announcement["message"], startsAt, endsAt, audience, plans, organizationIds, marketing, dismissible: raw.dismissible !== false }
}

const params = (a: AnnouncementInput) => [a.level, JSON.stringify(a.message), a.startsAt, a.endsAt, a.audience, a.plans, a.organizationIds, a.marketing, a.dismissible]

// what the audit entry keeps of an announcement
const snapshot = (a: Announcement) => ({
  level: a.level,
  message: a.message,
  startsAt: a.startsAt.toISOString(),
  endsAt: a.endsAt?.toISOString() ?? null,
  audience: a.audience,
  plans: a.plans,
  organizationIds: a.organizationIds,
  marketing: a.marketing,
  dismissible: a.dismissible,
})

async function lockAnnouncement(tx: Queryable, id: unknown): Promise<Announcement> {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new AdminError("not_found", "Announcement not found")
  const { rows } = await tx.query<Row>(`select ${COLUMNS} from app.announcements where id = $1 for update`, [id])
  if (!rows[0]) throw new AdminError("not_found", "Announcement not found")
  return toAnnouncement(rows[0])
}

// ---------- changing (in withAdminAction's transaction) ----------

export async function createAnnouncement(tx: Queryable, actorId: string, raw: Record<string, unknown>): Promise<ActionChange<{ announcement: Announcement }>> {
  const input = await cleanAnnouncement(tx, raw)
  const { rows } = await tx.query<Row>(
    `insert into app.announcements (level, message, starts_at, ends_at, audience, plans, organization_ids, marketing, dismissible, created_by)
     values ($1, $2::jsonb, $3, $4, $5, $6::text[], $7::uuid[], $8, $9, $10)
     returning ${COLUMNS}`,
    [...params(input), actorId],
  )
  const announcement = toAnnouncement(rows[0]!)
  return { before: null, after: snapshot(announcement), extra: { announcement } }
}

export async function updateAnnouncement(tx: Queryable, id: unknown, raw: Record<string, unknown>): Promise<ActionChange<{ announcement: Announcement }>> {
  const current = await lockAnnouncement(tx, id)
  // an announcement that already started keeps its start unless a new one is sent
  const input = await cleanAnnouncement(tx, { ...raw, startsAt: raw.startsAt ?? current.startsAt.toISOString() })
  const { rows } = await tx.query<Row>(
    `update app.announcements set level = $1, message = $2::jsonb, starts_at = $3, ends_at = $4, audience = $5,
            plans = $6::text[], organization_ids = $7::uuid[], marketing = $8, dismissible = $9
      where id = $10
      returning ${COLUMNS}`,
    [...params(input), current.id],
  )
  const announcement = toAnnouncement(rows[0]!)
  return { before: snapshot(current), after: snapshot(announcement), extra: { announcement } }
}

/** Takes a running announcement down now; one that hasn't started is deleted instead. */
export async function endAnnouncement(tx: Queryable, id: unknown): Promise<ActionChange> {
  const current = await lockAnnouncement(tx, id)
  const status = announcementStatus(current)
  if (status === "ended") throw invalid("This announcement has already ended")
  if (status === "scheduled") throw invalid("This announcement hasn't started yet. Delete it instead")
  const { rows } = await tx.query<{ ends_at: Date }>("update app.announcements set ends_at = now() where id = $1 returning ends_at", [current.id])
  return { before: { endsAt: current.endsAt?.toISOString() ?? null }, after: { endsAt: rows[0]!.ends_at.toISOString() }, extra: {} }
}

export async function deleteAnnouncement(tx: Queryable, id: unknown): Promise<ActionChange> {
  const current = await lockAnnouncement(tx, id)
  await tx.query("delete from app.announcements where id = $1", [current.id])
  return { before: snapshot(current), after: null, extra: {} }
}

// ---------- reading ----------

/** Every announcement, newest first, for the admin page (bounded; old ones are not worth paging through). */
export async function listAnnouncements(q: Queryable, limit = 200): Promise<Announcement[]> {
  const { rows } = await q.query<Row>(`select ${COLUMNS} from app.announcements order by created_at desc limit $1`, [limit])
  return rows.map(toAnnouncement)
}

/**
 * Announcements that are running or will start, at most SETTINGS_CACHE_MS old. Filter them per
 * viewer with announcementsFor / marketingAnnouncements, which also apply the time window, so a
 * scheduled one appears on time even from the cache.
 */
export const liveAnnouncements = (q: Queryable): Promise<Announcement[]> =>
  cachedRead(q, "announcements", async (q) => {
    const { rows } = await q.query<Row>(`select ${COLUMNS} from app.announcements where ends_at is null or ends_at > now() order by starts_at desc limit 50`)
    return rows.map(toAnnouncement)
  })

const LEVEL_ORDER: Record<AnnouncementLevel, number> = { critical: 0, warn: 1, info: 2 }
const byLevel = (a: Announcement, b: Announcement) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.startsAt.getTime() - a.startsAt.getTime()

/** The running announcements a member of this workspace sees, the most serious first. */
export function announcementsFor(list: Announcement[], viewer: { organizationId: string; plan: Plan }, now = Date.now()): Announcement[] {
  return list
    .filter((a) => announcementStatus(a, now) === "active")
    .filter((a) => a.audience === "all" || (a.audience === "plan" ? a.plans.includes(viewer.plan) : a.organizationIds.includes(viewer.organizationId.toLowerCase())))
    .sort(byLevel)
}

/** The running announcements for the public site. */
export function marketingAnnouncements(list: Announcement[], now = Date.now()): Announcement[] {
  return list.filter((a) => a.marketing && a.audience === "all" && announcementStatus(a, now) === "active").sort(byLevel)
}

/** Names of the workspaces the announcements target, for the admin page. */
export async function announcementWorkspaces(q: Queryable, list: Announcement[]): Promise<Record<string, { name: string; plan: string }>> {
  const ids = [...new Set(list.flatMap((a) => a.organizationIds))]
  if (!ids.length) return {}
  const { rows } = await q.query<{ id: string; name: string; plan: string }>("select id, name, plan from app.organizations where id = any($1::uuid[])", [ids])
  return Object.fromEntries(rows.map((r) => [r.id, { name: r.name, plan: r.plan }]))
}
