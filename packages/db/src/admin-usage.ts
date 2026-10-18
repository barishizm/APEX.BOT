import type { Queryable } from "./db.ts"
import { DEFAULT_SETTINGS, findModel, LIMITS, PROVIDERS, type ModelInfo, type Provider } from "./bot-settings.ts"
import { PLANS, type Plan } from "./plans.ts"

// /admin/usage: tokens the chat API spent (app.token_usage) and what they cost, priced from
// MODELS[].price. Every cost here is an estimate: a bot's day is priced at the model its settings
// name now (a model changed mid-range, or a fallback that answered, isn't seen), and days counted
// before migration 0028 have no input/output split.

export const USAGE_RANGES = [7, 30, 90] as const
export type UsageRange = (typeof USAGE_RANGES)[number]
export const parseUsageRange = (raw: unknown): UsageRange => {
  const n = Number(raw)
  return (USAGE_RANGES as readonly number[]).includes(n) ? (n as UsageRange) : 30
}

/**
 * Share of tokens priced as input where a row has no input/output split. A chat turn sends the
 * system prompt, the retrieved excerpts and the history, and gets a short answer back.
 */
export const ESTIMATED_INPUT_SHARE = 0.85
/** Share of its daily limit a bot has spent today that lists it as near its ceiling. */
export const NEAR_BUDGET_RATIO = 0.8
/** Bots and workspaces in the "top spenders" tables. */
export const USAGE_TOP = 20
/** Rows in the near-the-ceiling list. */
export const NEAR_BUDGET_LIMIT = 50

// ---------- What the chat API runs with ----------

/** platform_settings key the chat API writes at startup. */
export const API_RUNTIME_KEY = "api.runtime"

/** The API keys whose presence is reported; only true/false is ever stored, never a value. */
export const RUNTIME_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "RESEND_API_KEY"] as const
export type RuntimeKey = (typeof RUNTIME_KEYS)[number]

export interface ApiRuntime {
  reportedAt: string
  /** Whether each key is set on the chat API. */
  keys: Record<RuntimeKey, boolean>
  /** APEX_EMBEDDINGS, e.g. "gemini:gemini-embedding-2@768"; null when search is keyword-only. */
  embeddings: string | null
  /** APEX_GEMINI_TIER as declared by whoever set the key; null when nobody said. */
  geminiTier: "free" | "paid" | null
  /** APEX_MAX_DAILY_TOKENS: the platform ceiling on any bot's daily budget. */
  maxDailyTokensPerTenant: number
  /** APEX_MODEL. */
  defaultModel: string
  /** APEX_TOPIC_MODEL; null when topic labeling is off. */
  topicModel: string | null
}

const flags = (raw: unknown): Record<RuntimeKey, boolean> => {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(RUNTIME_KEYS.map((k) => [k, src[k] === true])) as Record<RuntimeKey, boolean>
}
const text = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 200) : null)
const tier = (v: unknown) => (v === "free" || v === "paid" ? v : null)

/** Records what the chat API runs with, for /admin/usage. Called by the API at startup. */
export async function reportApiRuntime(q: Queryable, runtime: Omit<ApiRuntime, "reportedAt">): Promise<void> {
  const value: ApiRuntime = {
    reportedAt: new Date().toISOString(),
    keys: flags(runtime.keys),
    embeddings: text(runtime.embeddings),
    geminiTier: tier(runtime.geminiTier),
    maxDailyTokensPerTenant: Number(runtime.maxDailyTokensPerTenant) || LIMITS.dailyTokenBudget.max,
    defaultModel: text(runtime.defaultModel) ?? "",
    topicModel: text(runtime.topicModel),
  }
  await q.query(
    `insert into app.platform_settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [API_RUNTIME_KEY, JSON.stringify(value)],
  )
}

/** The chat API's last report; null until an API with this code has started against this database. */
export async function readApiRuntime(q: Queryable): Promise<ApiRuntime | null> {
  const { rows } = await q.query<{ value: Record<string, unknown> }>("select value from app.platform_settings where key = $1", [API_RUNTIME_KEY])
  const v = rows[0]?.value
  if (!v || typeof v !== "object") return null
  return {
    reportedAt: text(v.reportedAt) ?? "",
    keys: flags(v.keys),
    embeddings: text(v.embeddings),
    geminiTier: tier(v.geminiTier),
    maxDailyTokensPerTenant: Number(v.maxDailyTokensPerTenant) || LIMITS.dailyTokenBudget.max,
    defaultModel: text(v.defaultModel) ?? "",
    topicModel: text(v.topicModel),
  }
}

/** Whether the chat API embeds with Gemini on a key nobody declared paid (free-tier quota, data use). */
export const freeGeminiEmbeddings = (r: ApiRuntime | null) => !!r?.embeddings?.startsWith("gemini:") && r.geminiTier !== "paid"

// ---------- Pricing ----------

export interface PricedModel {
  provider: Provider
  id: string
  label: string
  /** USD per million tokens; null where MODELS has no published rate. */
  price: ModelInfo["price"] | null
}

/** The model a bot's stored settings name, read as the chat API reads them (missing parts fall back to the defaults). */
export function resolveModel(provider: unknown, id: unknown): PricedModel {
  const p = PROVIDERS.some((x) => x.id === provider) ? (provider as Provider) : DEFAULT_SETTINGS.model.provider
  const i = typeof id === "string" && id ? id : DEFAULT_SETTINGS.model.id
  const info = findModel(p, i)
  return { provider: p, id: i, label: info?.label ?? i, price: info?.price ?? null }
}

/** Token totals and their estimated cost. */
export interface UsageSums {
  tokens: number
  /** Recorded input/output tokens. */
  input: number
  output: number
  /** Tokens without a split (counted before migration 0028), priced at ESTIMATED_INPUT_SHARE. */
  unsplit: number
  /** USD, over the tokens that have a price. */
  cost: number
  /** Tokens on models without a price in MODELS; they add nothing to `cost`. */
  unpriced: number
}

export const emptySums = (): UsageSums => ({ tokens: 0, input: 0, output: 0, unsplit: 0, cost: 0, unpriced: 0 })

/** Prices one row of usage. */
export function priceUsage(row: { tokens: number; input: number; output: number }, price: PricedModel["price"]): UsageSums {
  const tokens = Math.max(0, row.tokens)
  const input = Math.max(0, row.input)
  const output = Math.max(0, row.output)
  const unsplit = Math.max(0, tokens - input - output)
  if (!price) return { tokens, input, output, unsplit, cost: 0, unpriced: tokens }
  const inTokens = input + unsplit * ESTIMATED_INPUT_SHARE
  const outTokens = output + unsplit * (1 - ESTIMATED_INPUT_SHARE)
  return { tokens, input, output, unsplit, cost: (inTokens * price.input + outTokens * price.output) / 1_000_000, unpriced: 0 }
}

function add<T extends UsageSums>(into: T, s: UsageSums): T {
  into.tokens += s.tokens
  into.input += s.input
  into.output += s.output
  into.unsplit += s.unsplit
  into.cost += s.cost
  into.unpriced += s.unpriced
  return into
}

// ---------- The page ----------

export interface UsageBot extends UsageSums {
  id: string
  name: string
  organizationId: string
  organizationName: string
  plan: Plan
  model: PricedModel
}

export interface UsageWorkspace extends UsageSums {
  id: string
  name: string
  plan: Plan
  bots: number
}

export interface UsagePlan extends UsageSums {
  plan: Plan
  workspaces: number
  /** Workspaces with any usage in the range. */
  activeWorkspaces: number
}

export interface UsageProvider extends UsageSums {
  provider: Provider
  /** Bots with usage in the range on this provider. */
  bots: number
  /** Bots configured for this provider now, used or not. */
  configuredBots: number
}

export interface UsageModel extends UsageSums {
  model: PricedModel
  bots: number
}

export interface NearBudgetBot {
  id: string
  name: string
  organizationId: string
  organizationName: string
  /** Tokens spent today (UTC). */
  tokens: number
  /** The bot's own budget: staff override while one is active, else its setting. */
  budget: number
  override: boolean
  /** What stops it first: its own budget or the platform ceiling (APEX_MAX_DAILY_TOKENS). */
  limit: number
  limitedBy: "bot" | "platform"
}

export interface PlatformUsage {
  days: UsageRange
  /** UTC days, oldest first, including today. */
  daily: (UsageSums & { day: string })[]
  totals: UsageSums & { bots: number; workspaces: number }
  providers: UsageProvider[]
  models: UsageModel[]
  /** Every bot and workspace with usage in the range, biggest first (the page shows USAGE_TOP; the CSV all). */
  bots: UsageBot[]
  workspaces: UsageWorkspace[]
  plans: UsagePlan[]
  nearBudget: { total: number; rows: NearBudgetBot[] }
  /** The platform ceiling in effect: the chat API's report, else the default. */
  maxDailyTokens: number
  runtime: ApiRuntime | null
}

interface SumRow {
  tokens: number
  input: number
  output: number
  provider: string | null
  model: string | null
}

// $1 days; d0 is the first UTC day ("7 days" is today plus the six before it)
const D0 = "(now() at time zone 'utc')::date - ($1::int - 1)"

/** Platform-wide token usage and estimated cost over the last `range` UTC days. Staff only: check before calling. */
export async function platformUsage(db: Queryable, range?: unknown): Promise<PlatformUsage> {
  const days = parseUsageRange(range)
  const budget = LIMITS.dailyTokenBudget
  const runtime = await readApiRuntime(db)
  const maxDailyTokens = runtime?.maxDailyTokensPerTenant ?? budget.max

  const [perBot, perDay, plans, configured, near] = await Promise.all([
    db.query<SumRow & { id: string; name: string; organizationId: string; organizationName: string; plan: Plan }>(
      `select b.id, b.name, o.id as "organizationId", o.name as "organizationName", o.plan,
              b.settings #>> '{model,provider}' as provider, b.settings #>> '{model,id}' as model,
              sum(t.tokens)::float8 as tokens, sum(t.input_tokens)::float8 as input, sum(t.output_tokens)::float8 as output
         from app.token_usage t
         join app.bots b on b.id = t.bot_id
         join app.organizations o on o.id = b.organization_id
        where t.day >= ${D0}
        group by b.id, o.id`,
      [days],
    ),
    db.query<SumRow & { day: string }>(
      `select to_char(t.day, 'YYYY-MM-DD') as day, b.settings #>> '{model,provider}' as provider, b.settings #>> '{model,id}' as model,
              sum(t.tokens)::float8 as tokens, sum(t.input_tokens)::float8 as input, sum(t.output_tokens)::float8 as output
         from app.token_usage t join app.bots b on b.id = t.bot_id
        where t.day >= ${D0}
        group by 1, 2, 3`,
      [days],
    ),
    db.query<{ plan: Plan; n: number }>("select plan, count(*)::int as n from app.organizations group by plan"),
    db.query<{ provider: string | null; n: number }>("select settings #>> '{model,provider}' as provider, count(*)::int as n from app.bots group by 1"),
    // the limit as the chat API applies it: an active staff override, else the bot's setting (its
    // default when unset, within the allowed range); then the platform ceiling
    db.query<{ id: string; name: string; organizationId: string; organizationName: string; tokens: number; budget: number; override: boolean; total: number }>(
      `with x as (
         select b.id, b.name, o.id as "organizationId", o.name as "organizationName", t.tokens::float8 as tokens,
                coalesce(b.token_budget_override_until > now(), false) as override,
                case when b.token_budget_override_until > now() then b.token_budget_override::float8
                     else least(greatest(case when jsonb_typeof(b.settings #> '{security,dailyTokenBudget}') = 'number'
                                              then (b.settings #>> '{security,dailyTokenBudget}')::numeric else $1 end, $2), $3)::float8
                end as budget
           from app.token_usage t
           join app.bots b on b.id = t.bot_id
           join app.organizations o on o.id = b.organization_id
          where t.day = (now() at time zone 'utc')::date
       )
       select x.*, count(*) over ()::int as total
         from x
        where x.tokens >= $4 * least(x.budget, $5)
        order by x.tokens / greatest(least(x.budget, $5), 1) desc, x.tokens desc
        limit $6`,
      [DEFAULT_SETTINGS.security.dailyTokenBudget, budget.min, budget.max, NEAR_BUDGET_RATIO, maxDailyTokens, NEAR_BUDGET_LIMIT],
    ),
  ])

  // per day, oldest first, with the days nothing was spent
  const byDay = new Map<string, UsageSums>()
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  for (let i = days - 1; i >= 0; i--) byDay.set(new Date(today - i * 86_400_000).toISOString().slice(0, 10), emptySums())
  for (const r of perDay.rows) {
    const sums = byDay.get(r.day)
    if (sums) add(sums, priceUsage(r, resolveModel(r.provider, r.model).price))
  }

  const totals = { ...emptySums(), bots: 0, workspaces: 0 }
  const providers = new Map<Provider, UsageProvider>(
    PROVIDERS.map((p) => [p.id, { ...emptySums(), provider: p.id, bots: 0, configuredBots: 0 }]),
  )
  for (const c of configured.rows) providers.get(resolveModel(c.provider, null).provider)!.configuredBots += c.n
  const models = new Map<string, UsageModel>()
  const workspaces = new Map<string, UsageWorkspace>()
  const planSums = new Map<Plan, UsageSums & { active: Set<string> }>(PLANS.map((p) => [p, { ...emptySums(), active: new Set<string>() }]))

  const bots: UsageBot[] = perBot.rows.map((r) => {
    const model = resolveModel(r.provider, r.model)
    const sums = priceUsage(r, model.price)
    add(totals, sums)
    totals.bots++
    const p = providers.get(model.provider)!
    add(p, sums).bots++
    const mk = `${model.provider}:${model.id}`
    if (!models.has(mk)) models.set(mk, { ...emptySums(), model, bots: 0 })
    add(models.get(mk)!, sums).bots++
    if (!workspaces.has(r.organizationId)) workspaces.set(r.organizationId, { ...emptySums(), id: r.organizationId, name: r.organizationName, plan: r.plan, bots: 0 })
    add(workspaces.get(r.organizationId)!, sums).bots++
    const ps = planSums.get(r.plan)
    if (ps) {
      add(ps, sums)
      ps.active.add(r.organizationId)
    }
    return { ...sums, id: r.id, name: r.name, organizationId: r.organizationId, organizationName: r.organizationName, plan: r.plan, model }
  })
  totals.workspaces = workspaces.size

  const byTokens = (a: UsageSums, b: UsageSums) => b.tokens - a.tokens || b.cost - a.cost
  const planCounts = new Map(plans.rows.map((r) => [r.plan, r.n]))
  const strip = <T extends { total: number }>({ total: _, ...rest }: T) => rest

  return {
    days,
    daily: [...byDay].map(([day, sums]) => ({ ...sums, day })),
    totals,
    providers: [...providers.values()],
    models: [...models.values()].sort(byTokens),
    bots: bots.sort(byTokens),
    workspaces: [...workspaces.values()].sort(byTokens),
    plans: PLANS.map((plan) => {
      const { active, ...sums } = planSums.get(plan)!
      return { ...sums, plan, workspaces: planCounts.get(plan) ?? 0, activeWorkspaces: active.size }
    }),
    nearBudget: {
      total: near.rows[0]?.total ?? 0,
      rows: near.rows.map((r) => {
        const row = strip(r)
        const limitedBy = maxDailyTokens < row.budget ? ("platform" as const) : ("bot" as const)
        return { ...row, limit: Math.min(row.budget, maxDailyTokens), limitedBy }
      }),
    },
    maxDailyTokens,
    runtime,
  }
}

export interface UsageExportRow extends UsageSums {
  day: string
  botId: string
  botName: string
  organizationId: string
  organizationName: string
  plan: Plan
  model: PricedModel
}

/** One row per bot and UTC day over the range, newest first, for the CSV export; `limit` rows at most. */
export async function usageExportRows(db: Queryable, range: unknown, limit: number): Promise<{ rows: UsageExportRow[]; truncated: boolean }> {
  const days = parseUsageRange(range)
  const { rows } = await db.query<SumRow & { day: string; botId: string; botName: string; organizationId: string; organizationName: string; plan: Plan }>(
    `select to_char(t.day, 'YYYY-MM-DD') as day, b.id as "botId", b.name as "botName", o.id as "organizationId", o.name as "organizationName", o.plan,
            b.settings #>> '{model,provider}' as provider, b.settings #>> '{model,id}' as model,
            t.tokens::float8 as tokens, t.input_tokens::float8 as input, t.output_tokens::float8 as output
       from app.token_usage t
       join app.bots b on b.id = t.bot_id
       join app.organizations o on o.id = b.organization_id
      where t.day >= ${D0}
      order by t.day desc, t.tokens desc, b.id
      limit $2`,
    [days, limit + 1],
  )
  return {
    truncated: rows.length > limit,
    rows: rows.slice(0, limit).map(({ provider, model: id, ...r }) => {
      const model = resolveModel(provider, id)
      return { ...r, ...priceUsage(r, model.price), model }
    }),
  }
}
