// Tenant registry. Each customer site is a tenant; its public site_key is only usable
// from the origins on its allowlist.
import { DEFAULT_SETTINGS, LANGS, type BotSettings, type PublicWidgetSettings } from "@apex/db/bot-settings";
import type { ModelChoice } from "./model.ts";
import type { Lang } from "./text.ts";

export type Tone = "formal" | "friendly" | "concise" | "detailed";

export interface TenantSettings {
  botName: string;
  tone: Tone;
  defaultLang: Lang;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  greeting: Record<Lang, string>;
  suggestions: Record<Lang, string[]>;
  privacyUrl?: string;
  /** Topics the assistant must decline, set by the site owner. */
  blockedTopics: string[];
  /** Model for this tenant; the deployment default (APEX_MODEL) when absent. */
  model?: ModelChoice;
  responseLength?: BotSettings["persona"]["responseLength"];
  useEmoji?: boolean;
  /** Owner-written rules appended to the system prompt, below the fixed rules. */
  instructions?: string;
  unknownAnswer?: Record<Lang, string>;
  confidence?: BotSettings["persona"]["confidence"];
  handoffEnabled?: boolean;
  offerHandoffWhenUnsure?: boolean;
  /** Email or link the assistant points visitors to when hand-off isn't available. */
  contact?: string;
  /** Full widget look and behavior from the dashboard; JSON-file tenants use the widget's defaults. */
  ui?: PublicWidgetSettings;
}

/** Per-tenant overrides of the deployment-wide limits. */
export interface TenantLimits {
  maxMessageChars?: number;
  ipMessagesPerMinute?: number;
  historyMessages?: number;
}

export interface Tenant {
  id: string;
  /** The workspace a dashboard-managed bot belongs to; feature flags can be set per workspace. */
  organizationId?: string;
  siteKey: string;
  name: string;
  allowedOrigins: string[];
  handoffEmail: string;
  dailyTokenBudget: number;
  /** A budget staff set for a while in the admin area; replaces dailyTokenBudget until `until` (epoch ms). */
  budgetOverride?: { tokens: number; until: number };
  retentionDays: number;
  settings: TenantSettings;
  limits?: TenantLimits;
  /** Managed in the dashboard (a row in app.bots), as opposed to data/tenants.json. */
  managed?: boolean;
}

/** The subset of settings the widget may see. Never includes the handoff address or limits. */
export function publicSettings(tenant: Tenant) {
  const { botName, defaultLang, primaryColor, position, greeting, suggestions, privacyUrl, ui } = tenant.settings;
  return { siteName: tenant.name, botName, defaultLang, primaryColor, position, greeting, suggestions, privacyUrl, ...(ui ? { ui } : {}) };
}

/** Maps a dashboard-managed bot to a tenant. */
export function tenantFromBot(
  bot: { id: string; organizationId?: string; organizationName: string; siteKey: string; settings: BotSettings; handoffVerified: boolean; budgetOverride?: { tokens: number; until: Date } | null },
  ui: PublicWidgetSettings,
): Tenant {
  const s = bot.settings;
  const handoffEnabled = s.handoff.enabled && bot.handoffVerified && !!s.handoff.email;
  return {
    id: bot.id,
    ...(bot.organizationId ? { organizationId: bot.organizationId } : {}),
    managed: true,
    siteKey: bot.siteKey,
    name: s.general.companyName || bot.organizationName,
    allowedOrigins: s.security.allowedOrigins,
    // only a confirmed address is ever mailed; otherwise hand-off and lead mail stay off
    handoffEmail: bot.handoffVerified ? s.handoff.email : "",
    dailyTokenBudget: s.security.dailyTokenBudget,
    ...(bot.budgetOverride ? { budgetOverride: { tokens: bot.budgetOverride.tokens, until: bot.budgetOverride.until.getTime() } } : {}),
    retentionDays: s.security.retentionDays,
    limits: {
      maxMessageChars: s.security.maxMessageChars,
      ipMessagesPerMinute: s.security.messagesPerMinute,
      historyMessages: s.model.historyMessages,
    },
    settings: {
      botName: s.general.botName,
      tone: s.persona.tone,
      defaultLang: s.general.defaultLang,
      primaryColor: s.appearance.primaryColor,
      position: s.appearance.position,
      greeting: s.messages.greeting,
      suggestions: s.messages.suggestions,
      privacyUrl: s.messages.privacyUrl || undefined,
      blockedTopics: s.persona.blockedTopics,
      model: {
        provider: s.model.provider,
        id: s.model.id,
        temperature: s.model.temperature,
        reasoning: s.model.reasoning,
        maxOutputTokens: s.model.maxOutputTokens,
        fallback: s.model.fallback.enabled ? { provider: s.model.fallback.provider, id: s.model.fallback.id } : undefined,
      },
      responseLength: s.persona.responseLength,
      useEmoji: s.persona.useEmoji,
      instructions: s.persona.instructions,
      unknownAnswer: s.messages.unknownAnswer,
      confidence: s.persona.confidence,
      handoffEnabled,
      offerHandoffWhenUnsure: s.handoff.offerWhenUnsure,
      contact: s.handoff.contact,
      // the widget shows "Talk to a human" only when /v1/handoff will actually accept it
      ui: { ...ui, handoff: { ...ui.handoff, enabled: handoffEnabled } },
    },
  };
}

/** Today's token budget: staff's override while it lasts, else the tenant's own. */
export function dailyBudget(tenant: Tenant, now: number): number {
  return tenant.budgetOverride && tenant.budgetOverride.until > now ? tenant.budgetOverride.tokens : tenant.dailyTokenBudget;
}

export function normalizeOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * A site that must not answer (staff disabled the bot or suspended its workspace). Only its key, id
 * and origins are kept: enough to tell its widget, on its own origins, that it is out of service.
 */
export interface PausedSite {
  id: string;
  siteKey: string;
  allowedOrigins: string[];
  /** A dashboard bot: its conversations live in Postgres, so erasing one must reach the database. */
  managed?: boolean;
  retentionDays: number;
}

export class TenantRegistry {
  private bySiteKey = new Map<string, Tenant>();
  private byId = new Map<string, Tenant>();
  private pausedBySiteKey = new Map<string, PausedSite>();
  private pausedById = new Map<string, PausedSite>();
  /** Origin -> how many sites allow it, so removing one keeps the others' origins. */
  private origins = new Map<string, number>();

  constructor(tenants: Tenant[]) {
    for (const tenant of tenants) {
      validateTenant(tenant);
      if (this.bySiteKey.has(tenant.siteKey)) throw new Error(`Duplicate site key for tenant ${tenant.id}`);
      this.add(tenant);
    }
  }

  /**
   * Adds or replaces a tenant (dashboard bots synced from the database). Unlike the JSON
   * file, an empty origin list is allowed: such a bot simply works nowhere yet.
   */
  upsert(tenant: Tenant): void {
    this.checkKey(tenant.id, tenant.siteKey);
    this.remove(tenant.id);
    this.add(tenant);
  }

  /** Takes a site out of service: it no longer resolves as a tenant, only as paused. */
  pause(site: PausedSite): void {
    this.checkKey(site.id, site.siteKey);
    this.remove(site.id);
    const paused: PausedSite = {
      id: site.id,
      siteKey: site.siteKey,
      allowedOrigins: cleanOrigins(site.allowedOrigins),
      managed: site.managed,
      retentionDays: site.retentionDays,
    };
    this.pausedBySiteKey.set(paused.siteKey, paused);
    this.pausedById.set(paused.id, paused);
    this.count(paused.allowedOrigins, 1);
  }

  /** Drops a site, serving or paused. */
  remove(id: string): void {
    const old = this.byId.get(id);
    if (old) {
      this.byId.delete(id);
      this.bySiteKey.delete(old.siteKey);
      this.count(old.allowedOrigins, -1);
    }
    const paused = this.pausedById.get(id);
    if (paused) {
      this.pausedById.delete(id);
      this.pausedBySiteKey.delete(paused.siteKey);
      this.count(paused.allowedOrigins, -1);
    }
  }

  findById(id: string): Tenant | undefined {
    return this.byId.get(id);
  }

  findBySiteKey(siteKey: string | undefined): Tenant | undefined {
    return siteKey ? this.bySiteKey.get(siteKey) : undefined;
  }

  findPaused(siteKey: string | undefined): PausedSite | undefined {
    return siteKey ? this.pausedBySiteKey.get(siteKey) : undefined;
  }

  /** A site by id, serving or paused: for what still applies to a paused site (erasure, retention). */
  findSite(id: string): Tenant | PausedSite | undefined {
    return this.byId.get(id) ?? this.pausedById.get(id);
  }

  isPaused(id: string): boolean {
    return this.pausedById.has(id);
  }

  /** Used for CORS preflights, which carry no site key; the real request is checked per site. */
  isKnownOrigin(origin: string): boolean {
    const normalized = normalizeOrigin(origin);
    return normalized !== null && this.origins.has(normalized);
  }

  all(): Tenant[] {
    return [...this.bySiteKey.values()];
  }

  private checkKey(id: string, siteKey: string): void {
    const clash = this.bySiteKey.get(siteKey) ?? this.pausedBySiteKey.get(siteKey);
    if (clash && clash.id !== id) throw new Error(`Duplicate site key for tenant ${id}`);
  }

  private add(tenant: Tenant): void {
    tenant.allowedOrigins = cleanOrigins(tenant.allowedOrigins);
    this.bySiteKey.set(tenant.siteKey, tenant);
    this.byId.set(tenant.id, tenant);
    this.count(tenant.allowedOrigins, 1);
  }

  private count(origins: string[], by: 1 | -1): void {
    for (const origin of origins) {
      const n = (this.origins.get(origin) ?? 0) + by;
      if (n <= 0) this.origins.delete(origin);
      else this.origins.set(origin, n);
    }
  }
}

const cleanOrigins = (origins: string[]) => [...new Set(origins.map((o) => normalizeOrigin(o)).filter((o): o is string => !!o))];

function validateTenant(t: Tenant): void {
  const fail = (msg: string) => {
    throw new Error(`Invalid tenant ${t?.id ?? "?"}: ${msg}`);
  };
  if (!t.id) fail("missing id");
  if (!/^apex_pk_[A-Za-z0-9]+$/.test(t.siteKey ?? "")) fail("siteKey must look like apex_pk_xxx");
  if (!Array.isArray(t.allowedOrigins) || t.allowedOrigins.length === 0) fail("allowedOrigins is empty");
  for (const origin of t.allowedOrigins) if (!normalizeOrigin(origin)) fail(`bad origin ${origin}`);
  if (!/^[^@\s]+@[^@\s]+$/.test(t.handoffEmail ?? "")) fail("handoffEmail is invalid");
  if (!(t.dailyTokenBudget > 0)) fail("dailyTokenBudget must be > 0");
  if (!(t.retentionDays > 0)) fail("retentionDays must be > 0");
  const s = t.settings;
  if (!s?.botName) fail("settings.botName is required");
  if (!LANGS.includes(s.defaultLang)) fail(`settings.defaultLang must be one of ${LANGS.join(", ")}`);
  if (!s.greeting?.[s.defaultLang]) fail(`settings.greeting needs ${s.defaultLang} (the default language)`);
  // A language the file leaves out gets the dashboard's default greeting and no suggestions
  s.greeting = { ...DEFAULT_SETTINGS.messages.greeting, ...s.greeting };
  s.suggestions = { ...DEFAULT_SETTINGS.messages.suggestions, ...s.suggestions };
  s.blockedTopics ??= [];
}
