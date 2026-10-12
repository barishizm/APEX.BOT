// Tenant registry. Each customer site is a tenant; its public site_key is only usable
// from the origins on its allowlist.
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
}

/** The subset of settings the widget may see. Never includes the handoff address or limits. */
export function publicSettings(tenant: Tenant) {
  const { botName, defaultLang, primaryColor, position, greeting, suggestions, privacyUrl } = tenant.settings;
  return { siteName: tenant.name, botName, defaultLang, primaryColor, position, greeting, suggestions, privacyUrl };
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
  private origins = new Set<string>();

  constructor(tenants: Tenant[]) {
    for (const tenant of tenants) {
      validateTenant(tenant);
      if (this.bySiteKey.has(tenant.siteKey)) throw new Error(`Duplicate site key for tenant ${tenant.id}`);
      tenant.allowedOrigins = tenant.allowedOrigins.map((o) => normalizeOrigin(o)!);
      this.bySiteKey.set(tenant.siteKey, tenant);
      for (const origin of tenant.allowedOrigins) this.origins.add(origin);
    }
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
