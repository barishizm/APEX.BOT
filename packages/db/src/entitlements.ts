import { DEFAULT_SETTINGS, MAX_TEMPERATURE, MODELS, findModel, type BotSettings, type Provider, type SettingsIssue } from "./bot-settings.ts"
import { MODEL_TIER_OF, type PlanEntitlements } from "./plans.ts"

// What a plan lets a bot use, applied on the server (docs/adr/0003-billing.md (e)). No database
// access, so the dashboard can show the same locks the server enforces:
//   - a save may not turn on what the plan doesn't include (planIssues). A value the bot already
//     had is kept, so a downgraded owner can still save the rest of the settings;
//   - the chat API serves what the plan allows (effectiveSettings): settings above the plan stay
//     stored and come back on an upgrade, but are not applied.

/** Whether the plan includes this model. A model missing from the catalog is never included. */
export function modelAllowed(ent: Pick<PlanEntitlements, "allowedModelTiers">, provider: string, id: string): boolean {
  const info = findModel(provider, id)
  return !!info && ent.allowedModelTiers.includes(MODEL_TIER_OF[info.tier])
}

/**
 * The model a bot on this plan answers with when its own isn't included: the default model if the
 * plan has it, else the default provider's first included model (Haiku on Free).
 */
export function planDefaultModel(ent: Pick<PlanEntitlements, "allowedModelTiers">): { provider: Provider; id: string } {
  const { provider, id } = DEFAULT_SETTINGS.model
  if (modelAllowed(ent, provider, id)) return { provider, id }
  const pick =
    MODELS.find((m) => m.provider === provider && !m.preview && modelAllowed(ent, m.provider, m.id)) ??
    MODELS.find((m) => !m.preview && modelAllowed(ent, m.provider, m.id))
  return pick ? { provider: pick.provider, id: pick.id } : { provider, id }
}

/** Settings a new bot on this plan starts with: the defaults, on a model the plan includes. */
export function planDefaults(settings: BotSettings, ent: PlanEntitlements): BotSettings {
  if (modelAllowed(ent, settings.model.provider, settings.model.id)) return settings
  return { ...settings, model: { ...settings.model, ...planDefaultModel(ent) } }
}

export const UPGRADE_MESSAGE = "Your plan doesn't include this. Upgrade to use it"

/**
 * What a save may not change on this plan: turning on a feature the plan doesn't include, or
 * picking a model or retention above it. `stored` is the bot's current settings; what it already
 * has (from a bigger plan) can stay, and topics to decline can be removed but not added.
 */
export function planIssues(next: BotSettings, stored: BotSettings, ent: PlanEntitlements): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  const issue = (path: string, message = UPGRADE_MESSAGE) => issues.push({ path, message })
  const m = next.model
  if (!modelAllowed(ent, m.provider, m.id) && !(m.provider === stored.model.provider && m.id === stored.model.id)) issue("model.id")
  const fb = m.fallback
  const storedFb = stored.model.fallback
  if (fb.enabled && !modelAllowed(ent, fb.provider, fb.id) && !(storedFb.enabled && fb.provider === storedFb.provider && fb.id === storedFb.id)) {
    issue("model.fallback.id")
  }
  if (!ent.removeBranding && !next.appearance.showBranding && stored.appearance.showBranding) issue("appearance.showBranding")
  if (!ent.declineTopics && next.persona.blockedTopics.some((t) => !stored.persona.blockedTopics.includes(t))) issue("persona.blockedTopics")
  if (!ent.leadCapture && next.handoff.leadCapture !== "off" && stored.handoff.leadCapture === "off") issue("handoff.leadCapture")
  const days = next.security.retentionDays
  if (days > ent.maxRetentionDays && days !== stored.security.retentionDays) {
    issue("security.retentionDays", `Your plan keeps conversations for at most ${ent.maxRetentionDays} days. Upgrade to keep them longer`)
  }
  return issues
}

/** The settings a bot serves with on this plan. The stored settings are left as they are. */
export function effectiveSettings(settings: BotSettings, ent: PlanEntitlements): BotSettings {
  let model = settings.model
  if (!modelAllowed(ent, model.provider, model.id)) {
    const swap = planDefaultModel(ent)
    model = { ...model, ...swap, temperature: Math.min(model.temperature, MAX_TEMPERATURE[swap.provider]) }
  }
  if (model.fallback.enabled && !modelAllowed(ent, model.fallback.provider, model.fallback.id)) {
    model = { ...model, fallback: { ...model.fallback, enabled: false } }
  }
  return {
    ...settings,
    model,
    appearance: ent.removeBranding ? settings.appearance : { ...settings.appearance, showBranding: true },
    persona: ent.declineTopics ? settings.persona : { ...settings.persona, blockedTopics: [] },
    handoff: ent.leadCapture ? settings.handoff : { ...settings.handoff, leadCapture: "off" },
    security: { ...settings.security, retentionDays: Math.min(settings.security.retentionDays, ent.maxRetentionDays) },
  }
}

/** Whether the website at `rank` (1 = first, see migrations/0036_plan_limits.sql) is paused on this plan. */
export const sitePaused = (rank: number, ent: Pick<PlanEntitlements, "websites">) => rank > ent.websites
