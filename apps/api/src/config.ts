// Runtime configuration. Everything has a dev default except the Anthropic key,
// which the SDK resolves itself (ANTHROPIC_API_KEY or an `ant auth login` profile).

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Config {
  port: number;
  /** Trust X-Forwarded-For for the client IP. Only enable behind a proxy you control. */
  trustProxy: boolean;
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
};

export function loadConfig(): Config {
  const effort = (process.env.APEX_EFFORT || "medium") as Effort;
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort)) {
    throw new Error("APEX_EFFORT must be one of low|medium|high|xhigh|max");
  }
  return {
    port: num("PORT", 8787),
    trustProxy: process.env.TRUST_PROXY === "1",
    model: process.env.APEX_MODEL || "claude-haiku-5-5",
    effort,
    maxOutputTokens: num("APEX_MAX_OUTPUT_TOKENS", 8000),
    // Haiku has no server-side fallback, so it is opt-in (e.g. with a Sonnet/Opus model).
    fallbacks: process.env.APEX_FALLBACKS === "on",
    limits: {
      ...defaultLimits,
      minRetrievalScore: num("APEX_MIN_RETRIEVAL_SCORE", defaultLimits.minRetrievalScore),
    },
  };
}
