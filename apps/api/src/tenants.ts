// Tenant registry. Each customer site is a tenant; its public site_key is only usable
// from the origins on its allowlist.
import type { BotSettings, PublicWidgetSettings } from "@apex/db/bot-settings";
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
  siteKey: string;
  name: string;
  allowedOrigins: string[];
  handoffEmail: string;
  dailyTokenBudget: number;
  retentionDays: number;
  settings: TenantSettings;
  limits?: TenantLimits;
}

/** The subset of settings the widget may see. Never includes the handoff address or limits. */
export function publicSettings(tenant: Tenant) {
  const { botName, defaultLang, primaryColor, position, greeting, suggestions, privacyUrl, ui } = tenant.settings;
  return { siteName: tenant.name, botName, defaultLang, primaryColor, position, greeting, suggestions, privacyUrl, ...(ui ? { ui } : {}) };
}

/** Maps a dashboard-managed bot to a tenant. */
export function tenantFromBot(bot: { id: string; organizationName: string; siteKey: string; settings: BotSettings }, ui: PublicWidgetSettings): Tenant {
  const s = bot.settings;
  return {
    id: bot.id,
    siteKey: bot.siteKey,
    name: s.general.companyName || bot.organizationName,
    allowedOrigins: s.security.allowedOrigins,
    handoffEmail: s.handoff.email,
    dailyTokenBudget: s.security.dailyTokenBudget,
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
      handoffEnabled: s.handoff.enabled && !!s.handoff.email,
      offerHandoffWhenUnsure: s.handoff.offerWhenUnsure,
      ui,
    },
  };
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

export class TenantRegistry {
  private bySiteKey = new Map<string, Tenant>();
  private byId = new Map<string, Tenant>();
  /** Origin -> how many tenants allow it, so removing one tenant keeps the others' origins. */
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
    const clash = this.bySiteKey.get(tenant.siteKey);
    if (clash && clash.id !== tenant.id) throw new Error(`Duplicate site key for tenant ${tenant.id}`);
    this.remove(tenant.id);
    this.add(tenant);
  }

  remove(id: string): void {
    const old = this.byId.get(id);
    if (!old) return;
    this.byId.delete(id);
    this.bySiteKey.delete(old.siteKey);
    for (const origin of old.allowedOrigins) {
      const n = (this.origins.get(origin) ?? 1) - 1;
      if (n <= 0) this.origins.delete(origin);
      else this.origins.set(origin, n);
    }
  }

  findById(id: string): Tenant | undefined {
    return this.byId.get(id);
  }

  private add(tenant: Tenant): void {
    tenant.allowedOrigins = [...new Set(tenant.allowedOrigins.map((o) => normalizeOrigin(o)).filter((o): o is string => !!o))];
    this.bySiteKey.set(tenant.siteKey, tenant);
    this.byId.set(tenant.id, tenant);
    for (const origin of tenant.allowedOrigins) this.origins.set(origin, (this.origins.get(origin) ?? 0) + 1);
  }

  findBySiteKey(siteKey: string | undefined): Tenant | undefined {
    return siteKey ? this.bySiteKey.get(siteKey) : undefined;
  }

  /** Used for CORS preflights, which carry no site key; the real request is checked per tenant. */
  isKnownOrigin(origin: string): boolean {
    const normalized = normalizeOrigin(origin);
    return normalized !== null && this.origins.has(normalized);
  }

  all(): Tenant[] {
    return [...this.bySiteKey.values()];
  }
}

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
  if (s.defaultLang !== "tr" && s.defaultLang !== "en") fail("settings.defaultLang must be tr or en");
  if (!s.greeting?.tr || !s.greeting?.en) fail("settings.greeting needs tr and en");
  s.suggestions ??= { tr: [], en: [] };
  s.blockedTopics ??= [];
}
