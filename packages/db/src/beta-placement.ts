import type { Queryable } from "./db.ts"
import { writeAudit } from "./admin.ts"
import { getSubscription, lockOrganization, refreshEffectivePlan, subscriptionGrants, type PaidPlan, type Subscription } from "./billing.ts"
import { findModel, replyFifths, repairSettings } from "./bot-settings.ts"
import { MODEL_TIER_OF, PLANS, PLAN_LIMITS, type ModelTier, type Plan } from "./plans.ts"

// Placing the beta workspaces on plans at launch (docs/adr/0003-billing.md (g)): each gets, free of
// charge and without a card, the plan that covers its last 30 days of use, as a plan override of
// kind 'beta' that ends after 60 days. Run once by `npm run billing:beta-placement`; a workspace that
// was placed already, or pays, is skipped, so running it again only places the ones it missed.

/** How long a beta placement runs (ADR 0003 (g)). */
export const BETA_PLACEMENT_DAYS = 60
/** The use a placement has to cover, counted back from the run. */
export const BETA_USAGE_DAYS = 30
export const BETA_PLACEMENT_AUDIT_ACTION = "organization.beta_placement"
/** Who the audit log names for a placement. */
export const BETA_PLACEMENT_ACTOR = "system:beta-placement"

const DAY = 24 * 60 * 60 * 1000
const rank = (plan: Plan) => PLANS.indexOf(plan)
const TIER_RANK: Record<ModelTier, number> = { fast: 0, standard: 1, premium: 2 }

/** What a workspace used in the last BETA_USAGE_DAYS, in the terms its plan limits are set in. */
export interface BetaUsage {
  /** AI replies, in fifths (ADR 0003 (b)). */
  replyFifths: number
  websites: number
  /** The most pages read from one website. */
  pages: number
  /** The dearest tier a bot answers or falls back with. */
  modelTier: ModelTier
  removeBranding: boolean
  declineTopics: boolean
  leadCapture: boolean
  retentionDays: number
}

/**
 * The smallest plan whose limits hold this use, so nothing pauses or stops applying at launch
 * (ADR 0003 (e)). Use above Business still gets Business; `fits` says whether it covers it.
 */
export function planCovering(u: BetaUsage): { plan: Plan; fits: boolean } {
  for (const plan of PLANS) {
    const l = PLAN_LIMITS[plan]
    if (
      u.replyFifths <= l.monthlyReplies * 5 &&
      u.websites <= l.websites &&
      u.pages <= l.websitePages &&
      l.allowedModelTiers.includes(u.modelTier) &&
      (!u.removeBranding || l.removeBranding) &&
      (!u.declineTopics || l.declineTopics) &&
      (!u.leadCapture || l.leadCapture) &&
      u.retentionDays <= l.maxRetentionDays
    )
      return { plan, fits: true }
  }
  return { plan: "business", fits: false }
}

export interface BetaPlacementOptions {
  now: Date
  endsAt: Date
  /** "auto": the plan that covers the use (ADR 0003 (g)); a paid plan: that plan for everyone. */
  plan: "auto" | PaidPlan
  /** With "auto", the least a workspace gets; "free" leaves a workspace whose use fits Free on Free. */
  minPlan: Plan
  /** Only workspaces created before this are beta workspaces. */
  createdBefore: Date
}

export type BetaSkip = "subscribed" | "placed" | "fits_free"

export interface BetaPlacement {
  organizationId: string
  name: string
  /** The plan the workspace is on now. */
  current: Plan
  usage: BetaUsage
  /** The smallest plan that covers the use, and whether even Business is short of it. */
  covering: Plan
  fits: boolean
  /** The plan it gets; null when skipped. */
  plan: PaidPlan | null
  skip: BetaSkip | null
}

const subscribed = (sub: Subscription | null, now: Date) => sub !== null && (sub.status !== "canceled" || subscriptionGrants(sub, now))

/** Every beta workspace's use over the last BETA_USAGE_DAYS before `now`. */
export async function betaUsage(q: Queryable, now: Date, createdBefore: Date) {
  const since = new Date(now.getTime() - BETA_USAGE_DAYS * DAY)
  const [orgs, bots, replies, counted, pages] = await Promise.all([
    q.query<{ id: string; name: string; plan: Plan; placed: boolean }>(
      `select o.id, o.name, o.plan,
              exists (select 1 from app.plan_overrides p where p.organization_id = o.id and p.kind = 'beta') as placed
         from app.organizations o where o.created_at < $1 order by o.created_at, o.id`,
      [createdBefore],
    ),
    q.query<{ id: string; organizationId: string; settings: unknown }>(`select id, organization_id as "organizationId", settings from app.bots`),
    // answers delivered (the "I don't know" ones too); the bot's model today weighs them, since a message doesn't keep its model
    q.query<{ botId: string; answers: number }>(
      `select bot_id as "botId", count(*)::int as answers from app.messages where role = 'assistant' and created_at >= $1 and created_at < $2 group by bot_id`,
      [since, now],
    ),
    // what the chat API counted with the real weights, where it has a month of it
    q.query<{ organizationId: string; fifths: number }>(
      `select organization_id as "organizationId", max(units * 5)::int as fifths from app.reply_usage where period_start >= $1 group by organization_id`,
      [new Date(since.getTime() - 31 * DAY)],
    ),
    q.query<{ botId: string; pages: number }>(`select bot_id as "botId", max(pages)::int as pages from app.knowledge_sources where kind = 'website' group by bot_id`),
  ])
  const answersOf = new Map(replies.rows.map((r) => [r.botId, r.answers]))
  const pagesOf = new Map(pages.rows.map((r) => [r.botId, r.pages]))
  const countedOf = new Map(counted.rows.map((r) => [r.organizationId, r.fifths]))
  const usage = new Map<string, BetaUsage>()
  for (const bot of bots.rows) {
    const s = repairSettings(bot.settings)
    const u = usage.get(bot.organizationId) ?? {
      replyFifths: 0,
      websites: 0,
      pages: 0,
      modelTier: "fast" as ModelTier,
      removeBranding: false,
      declineTopics: false,
      leadCapture: false,
      retentionDays: 0,
    }
    u.replyFifths += (answersOf.get(bot.id) ?? 0) * replyFifths(s.model.provider, s.model.id)
    u.websites++
    u.pages = Math.max(u.pages, pagesOf.get(bot.id) ?? 0)
    const models = [s.model, ...(s.model.fallback.enabled ? [s.model.fallback] : [])]
    for (const m of models) {
      const info = findModel(m.provider, m.id)
      const tier: ModelTier = info ? MODEL_TIER_OF[info.tier] : "premium"
      if (TIER_RANK[tier] > TIER_RANK[u.modelTier]) u.modelTier = tier
    }
    u.removeBranding ||= !s.appearance.showBranding
    u.declineTopics ||= s.persona.blockedTopics.length > 0
    u.leadCapture ||= s.handoff.leadCapture !== "off"
    u.retentionDays = Math.max(u.retentionDays, s.security.retentionDays)
    usage.set(bot.organizationId, u)
  }
  return orgs.rows.map((o) => {
    const u = usage.get(o.id) ?? { replyFifths: 0, websites: 0, pages: 0, modelTier: "fast", removeBranding: false, declineTopics: false, leadCapture: false, retentionDays: 0 }
    // the larger of the two: messages can be gone already (a short retention), the count only started recently
    u.replyFifths = Math.max(u.replyFifths, countedOf.get(o.id) ?? 0)
    return { organizationId: o.id, name: o.name, current: (PLANS.includes(o.plan) ? o.plan : "free") as Plan, placed: o.placed, usage: u }
  })
}

/** What a run would do for every beta workspace, without changing anything (the dry run reads this). */
export async function planBetaPlacements(q: Queryable, opts: BetaPlacementOptions): Promise<BetaPlacement[]> {
  const rows = await betaUsage(q, opts.now, opts.createdBefore)
  const subs = await q.query<Subscription>(
    `select organization_id as "organizationId", plan, status, current_period_start as "currentPeriodStart", current_period_end as "currentPeriodEnd",
            cancel_at_period_end as "cancelAtPeriodEnd", scheduled_change as "scheduledChange", grace_until as "graceUntil"
       from app.subscriptions`,
  )
  const subOf = new Map(subs.rows.map((s) => [s.organizationId, s]))
  return rows.map(({ placed, ...row }) => {
    const { plan: covering, fits } = planCovering(row.usage)
    // a plan staff set by hand during the beta is kept when it is the larger one
    const target = opts.plan !== "auto" ? opts.plan : [covering, opts.minPlan, row.current].reduce((a, b) => (rank(b) > rank(a) ? b : a))
    const skip: BetaSkip | null = subscribed(subOf.get(row.organizationId) ?? null, opts.now) ? "subscribed" : placed ? "placed" : target === "free" ? "fits_free" : null
    return { ...row, covering, fits, plan: skip ? null : (target as PaidPlan), skip }
  })
}

/**
 * Places one workspace: a 'beta' override from `now` to `endsAt`, its plan recomputed and the
 * placement audited. Checks again under the workspace's lock, so a run that races a checkout or
 * another run changes nothing. Must run in a transaction.
 */
export async function applyBetaPlacement(
  tx: Queryable,
  p: Pick<BetaPlacement, "organizationId" | "plan" | "usage" | "covering">,
  opts: Pick<BetaPlacementOptions, "now" | "endsAt">,
): Promise<{ applied: true; overrideId: string; plan: Plan } | { applied: false; reason: BetaSkip | "not_found" }> {
  if (!p.plan) return { applied: false, reason: "fits_free" }
  if (!(await lockOrganization(tx, p.organizationId))) return { applied: false, reason: "not_found" }
  if (subscribed(await getSubscription(tx, p.organizationId), opts.now)) return { applied: false, reason: "subscribed" }
  const before = await tx.query<{ plan: Plan }>("select plan from app.organizations where id = $1", [p.organizationId])
  const { rows } = await tx.query<{ id: string }>(
    `insert into app.plan_overrides (organization_id, plan, reason, starts_at, ends_at, kind)
     values ($1, $2, $3, $4, $5, 'beta') on conflict do nothing returning id`,
    [p.organizationId, p.plan, `Beta placement at launch (covers ${p.covering} use)`, opts.now, opts.endsAt],
  )
  if (!rows[0]) return { applied: false, reason: "placed" }
  const effective = (await refreshEffectivePlan(tx, p.organizationId, opts.now))!
  await writeAudit(tx, {
    actorId: null,
    actorLabel: BETA_PLACEMENT_ACTOR,
    action: BETA_PLACEMENT_AUDIT_ACTION,
    targetType: "organization",
    targetId: p.organizationId,
    reason: "ADR 0003 (g): beta workspace placed on a plan at launch",
    before: { plan: before.rows[0]!.plan },
    after: { plan: effective.plan, placement: { id: rows[0].id, plan: p.plan, endsAt: opts.endsAt.toISOString() }, usage: p.usage },
  })
  return { applied: true, overrideId: rows[0].id, plan: effective.plan }
}

/** The beta placement running for the workspace at `now`, if any. */
export async function runningBetaPlacement(q: Queryable, organizationId: string, now = new Date()): Promise<{ id: string; plan: PaidPlan; endsAt: Date } | null> {
  const { rows } = await q.query<{ id: string; plan: PaidPlan; endsAt: Date }>(
    `select id, plan, ends_at as "endsAt" from app.plan_overrides
      where organization_id = $1 and kind = 'beta' and revoked_at is null and starts_at <= $2 and ends_at > $2`,
    [organizationId, now],
  )
  return rows[0] ?? null
}
