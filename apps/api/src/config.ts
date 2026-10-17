// Runtime configuration. Everything has a dev default except the Anthropic key,
// which the SDK resolves itself (ANTHROPIC_API_KEY or an `ant auth login` profile).

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

/** TRUST_PROXY: "0"/unset = none, "1" = one proxy hop, "2" = two, ... (legacy "true" = 1) */
function trustedHops(raw: string | undefined): number {
  if (raw === "true") return 1;
  const n = Number(raw ?? 0);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Config {
  port: number;
  /** Number of proxies of ours in front of the API (0 = none). The client IP is the Nth entry from the right of X-Forwarded-For. */
  trustProxy: number;
  model: string;
  effort: Effort;
  maxOutputTokens: number;
  /** Server-side refusal fallbacks; Claude API only, and not available for Haiku models. */
  fallbacks: boolean;
  limits: Limits;
}

export interface Limits {
  maxMessageChars: number;
  /** Earlier messages (user + assistant) sent to the model with each turn. */
  historyMessages: number;
  maxConversationMessages: number;
  retrievalTopK: number;
  /** BM25 score below which a chunk counts as "not relevant" (the "I don't know" path). */
  minRetrievalScore: number;
  ipMessagesPerMinute: number;
  tenantMessagesPerMinute: number;
  handoffsPerHour: number;
  /** Conversation reads, erasures and ratings per IP: ids are unguessable, this keeps probing slow too. */
  lookupsPerMinute: number;
  /** Hand-off and lead emails one tenant may trigger, whoever the visitors are. */
  mailsPerTenantPerHour: number;
  mailsPerTenantPerDay: number;
  /** Emails to one recipient address across all tenants. */
  mailsPerRecipientPerHour: number;
  /** Platform ceiling on any tenant's dailyTokenBudget, whatever the tenant set. */
  maxDailyTokensPerTenant: number;
}

export const defaultLimits: Limits = {
  maxMessageChars: 1000,
  historyMessages: 8,
  maxConversationMessages: 60,
  retrievalTopK: 4,
  minRetrievalScore: 2,
  ipMessagesPerMinute: 15,
  tenantMessagesPerMinute: 300,
  handoffsPerHour: 5,
  lookupsPerMinute: 60,
  mailsPerTenantPerHour: 30,
  mailsPerTenantPerDay: 100,
  mailsPerRecipientPerHour: 40,
  maxDailyTokensPerTenant: 20_000_000,
};

export function loadConfig(): Config {
  const effort = (process.env.APEX_EFFORT || "medium") as Effort;
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) {
    throw new Error("APEX_EFFORT must be one of low|medium|high|xhigh|max");
  }
  return {
    port: num("PORT", 8787),
    trustProxy: trustedHops(process.env.TRUST_PROXY),
    model: process.env.APEX_MODEL || "claude-haiku-5-5",
    effort,
    maxOutputTokens: num("APEX_MAX_OUTPUT_TOKENS", 8000),
    // Haiku has no server-side fallback, so it is opt-in (e.g. with a Sonnet/Opus model).
    fallbacks: process.env.APEX_FALLBACKS === "on",
    limits: {
      ...defaultLimits,
      minRetrievalScore: num("APEX_MIN_RETRIEVAL_SCORE", defaultLimits.minRetrievalScore),
      maxDailyTokensPerTenant: num("APEX_MAX_DAILY_TOKENS", defaultLimits.maxDailyTokensPerTenant),
    },
  };
}
