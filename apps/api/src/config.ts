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
  /**
   * Embedder for hybrid search ("provider:model@dims", e.g. gemini:gemini-embedding-2@768), or null
   * for lexical search only. Off unless APEX_EMBEDDINGS names one: it sends every customer's content
   * and visitor messages to that provider.
   */
  embeddings: string | null;
  /** How long a visitor message waits for its embedding before searching lexically. */
  embeddingTimeoutMs: number;
  /**
   * Claude model that labels visitor questions with topics for the analytics page, in the
   * background (APEX_TOPIC_MODEL; "off" disables it, and so does APEX_MODEL=echo).
   */
  topicModel: string | null;
  /**
   * APEX_GEMINI_TIER: "paid" once billing is on for the Gemini key, "free" otherwise. It can't be
   * read from the key itself; /admin/usage warns about embedding quota until it says "paid".
   */
  geminiTier: "free" | "paid" | null;
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

function embeddingsSpec(raw: string | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "" || value === "off") return null;
  if (!/^(openai|gemini):[\w.-]+@\d+$/.test(value)) throw new Error("APEX_EMBEDDINGS must be off or provider:model@dims, e.g. gemini:gemini-embedding-2@768");
  return value;
}

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
    embeddings: embeddingsSpec(process.env.APEX_EMBEDDINGS),
    embeddingTimeoutMs: num("APEX_EMBEDDING_TIMEOUT_MS", 2500),
    topicModel: process.env.APEX_TOPIC_MODEL === "off" || process.env.APEX_MODEL === "echo" ? null : process.env.APEX_TOPIC_MODEL || "claude-haiku-5-5",
    geminiTier: process.env.APEX_GEMINI_TIER === "paid" ? "paid" : process.env.APEX_GEMINI_TIER === "free" ? "free" : null,
    limits: {
      ...defaultLimits,
      minRetrievalScore: num("APEX_MIN_RETRIEVAL_SCORE", defaultLimits.minRetrievalScore),
      maxDailyTokensPerTenant: num("APEX_MAX_DAILY_TOKENS", defaultLimits.maxDailyTokensPerTenant),
    },
  };
}
