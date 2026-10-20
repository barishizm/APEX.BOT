// The LLM behind the chat. The orchestrator only sees ChatModel, so tests swap in a fake.
// Prompts are built in Anthropic's message shape (prompt.ts); the OpenAI and Gemini
// adapters convert it: text blocks, plus the images a visitor attached to the latest turn.
import Anthropic from "@anthropic-ai/sdk";
import { findModel, type Provider, type Reasoning } from "@apex/db/bot-settings";
import type { Config } from "./config.ts";
import { log } from "./log.ts";

/** A tenant's model choice from the dashboard. */
export interface ModelChoice {
  provider: Provider;
  id: string;
  temperature?: number;
  reasoning?: Reasoning;
  maxOutputTokens?: number;
  /** Tried once when the primary fails or refuses before writing anything. */
  fallback?: { provider: Provider; id: string };
}

export interface ChatRequest {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  signal?: AbortSignal;
  /** Absent: the deployment default (APEX_MODEL). */
  model?: ModelChoice;
}

/** The model that wrote an answer: the tenant's choice, or its fallback when that one ran instead. */
export interface AnsweredBy {
  provider: Provider;
  id: string;
}

export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "end"; refused: boolean; truncated: boolean; inputTokens: number; outputTokens: number; model?: AnsweredBy };

export interface ChatModel {
  stream(request: ChatRequest): AsyncIterable<ModelEvent>;
}

const systemText = (system: ChatRequest["system"]) => system.map((b) => b.text).join("\n\n");

function contentText(content: Anthropic.Beta.BetaMessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** The base64 images in a turn (prompt.ts only ever adds base64 sources). */
function contentImages(content: Anthropic.Beta.BetaMessageParam["content"]): { mediaType: string; data: string }[] {
  if (typeof content === "string") return [];
  return content.flatMap((b) => (b.type === "image" && b.source.type === "base64" ? [{ mediaType: b.source.media_type, data: b.source.data }] : []));
}

/** OpenAI Responses input for one turn. */
export function openAIInput(m: Anthropic.Beta.BetaMessageParam) {
  const images = contentImages(m.content);
  if (!images.length) return { role: m.role, content: contentText(m.content) };
  return {
    role: m.role,
    content: [
      ...images.map((i) => ({ type: "input_image", image_url: `data:${i.mediaType};base64,${i.data}` })),
      { type: "input_text", text: contentText(m.content) },
    ],
  };
}

/** Gemini content for one turn. */
export function geminiContent(m: Anthropic.Beta.BetaMessageParam) {
  return {
    role: m.role === "assistant" ? "model" : "user",
    parts: [...contentImages(m.content).map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.data } })), { text: contentText(m.content) }],
  };
}

export class ClaudeChatModel implements ChatModel {
  private client: Anthropic;

  constructor(
    private config: Pick<Config, "model" | "effort" | "maxOutputTokens" | "fallbacks">,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async *stream({ system, messages, signal, model }: ChatRequest): AsyncIterable<ModelEvent> {
    const id = model?.id ?? this.config.model;
    const info = model ? findModel("anthropic", id) : undefined;
    // Effort is per tenant when chosen in the dashboard, else per deployment (APEX_EFFORT).
    // Claude Haiku 4.5 rejects effort; the 5.x models reject a custom temperature.
    const effort = model ? (info?.reasoning ? model.reasoning : undefined) : this.config.effort;
    const stream = this.client.beta.messages.stream(
      {
        model: id,
        max_tokens: model?.maxOutputTokens ?? this.config.maxOutputTokens,
        system,
        messages,
        ...(effort ? { output_config: { effort } } : {}),
        ...(info?.temperature && model?.temperature !== undefined ? { temperature: Math.min(model.temperature, 1) } : {}),
        // On a safety-classifier refusal the API re-runs the turn on Anthropic's recommended fallback model.
        // A tenant's own fallback (ModelRouter) replaces it.
        ...(this.config.fallbacks && !model?.fallback && !id.includes("haiku")
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    const usage = final.usage;
    yield {
      type: "end",
      refused: final.stop_reason === "refusal",
      truncated: final.stop_reason === "max_tokens",
      inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      outputTokens: usage.output_tokens,
      // the server-side fallback answers under its own model id; anything else is the one asked for
      model: { provider: "anthropic", id: final.model && final.model !== id && findModel("anthropic", final.model) ? final.model : id },
    };
  }
}

/** Minimal SSE reader for the providers' streaming endpoints: yields each `data:` payload. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = done ? "" : frames.pop()!;
    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data && data !== "[DONE]") yield data;
    }
    if (done) return;
  }
}

export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly status: number,
    message: string,
  ) {
    super(`${provider} ${status}: ${message}`);
  }
}

/** Longest a provider may take for one whole answer before the turn fails (and the fallback, if any, runs). */
export const PROVIDER_TIMEOUT_MS = Number(process.env.APEX_PROVIDER_TIMEOUT_MS) || 90_000;

async function post(provider: Provider, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  // The visitor's own abort (closing the chat) and the timeout both stop the request
  const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((error) => {
    if (timeout.aborted) throw new ProviderError(provider, 0, `no response within ${PROVIDER_TIMEOUT_MS / 1000}s`);
    throw error;
  });
  if (!res.ok || !res.body) {
    // Provider error bodies can echo the prompt, so only a short prefix is kept
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(provider, res.status, detail || res.statusText);
  }
  return res.body;
}

/** OpenAI Responses API, streamed. */
export class OpenAIChatModel implements ChatModel {
  constructor(
    private apiKey = process.env.OPENAI_API_KEY,
    private baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  ) {}

  async *stream({ system, messages, signal, model }: ChatRequest): AsyncIterable<ModelEvent> {
    if (!model) throw new Error("OpenAIChatModel needs a model choice");
    if (!this.apiKey) throw new ProviderError("openai", 0, "OPENAI_API_KEY is not set");
    const info = findModel("openai", model.id);
    const body = await post(
      "openai",
      `${this.baseUrl}/responses`,
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: model.id,
        instructions: systemText(system),
        input: messages.map(openAIInput),
        max_output_tokens: model.maxOutputTokens ?? 1024,
        stream: true,
        // conversations are stored by us, under our retention rules
        store: false,
        ...(info?.reasoning && model.reasoning ? { reasoning: { effort: model.reasoning } } : {}),
        ...(info?.temperature && model.temperature !== undefined ? { temperature: model.temperature } : {}),
      },
      signal,
    );

    let refused = false;
    for await (const data of sseData(body)) {
      const event = JSON.parse(data);
      switch (event.type) {
        case "response.output_text.delta":
          if (event.delta) yield { type: "text", text: event.delta };
          break;
        case "response.refusal.delta":
          refused = true;
          break;
        case "response.completed":
        case "response.incomplete": {
          const r = event.response ?? {};
          const reason = r.incomplete_details?.reason;
          yield {
            type: "end",
            refused: refused || reason === "content_filter",
            truncated: reason === "max_output_tokens",
            inputTokens: r.usage?.input_tokens ?? 0,
            outputTokens: r.usage?.output_tokens ?? 0,
            model: { provider: "openai", id: model.id },
          };
          return;
        }
        case "response.failed":
          throw new ProviderError("openai", 0, event.response?.error?.message ?? "response failed");
        case "error":
          // e.g. { error: { code: "credit_balance_exhausted", message } }
          throw new ProviderError("openai", 0, [event.error?.code ?? event.code, event.error?.message ?? event.message].filter(Boolean).join(": ") || "stream error");
      }
    }
    throw new ProviderError("openai", 0, "stream ended without a final response");
  }
}

// Gemini 3 thinking levels; "medium" is not accepted by every model, so it maps up.
const GEMINI_THINKING: Record<Reasoning, string> = { low: "low", medium: "high", high: "high" };
const GEMINI_BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

/** Google Gemini API (generativelanguage), streamed. */
export class GeminiChatModel implements ChatModel {
  constructor(
    private apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    private baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  async *stream({ system, messages, signal, model }: ChatRequest): AsyncIterable<ModelEvent> {
    if (!model) throw new Error("GeminiChatModel needs a model choice");
    if (!this.apiKey) throw new ProviderError("google", 0, "GEMINI_API_KEY is not set");
    const info = findModel("google", model.id);
    const body = await post(
      "google",
      `${this.baseUrl}/models/${encodeURIComponent(model.id)}:streamGenerateContent?alt=sse`,
      { "x-goog-api-key": this.apiKey },
      {
        systemInstruction: { parts: [{ text: systemText(system) }] },
        contents: messages.map(geminiContent),
        generationConfig: {
          maxOutputTokens: model.maxOutputTokens ?? 1024,
          ...(info?.temperature && model.temperature !== undefined ? { temperature: model.temperature } : {}),
          ...(info?.reasoning && model.reasoning ? { thinkingConfig: { thinkingLevel: GEMINI_THINKING[model.reasoning] } } : {}),
        },
      },
      signal,
    );

    let refused = false;
    let truncated = false;
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const data of sseData(body)) {
      const chunk = JSON.parse(data);
      if (chunk.promptFeedback?.blockReason) refused = true;
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        // thought summaries are never shown to visitors
        if (typeof part.text === "string" && part.text && !part.thought) yield { type: "text", text: part.text };
      }
      if (candidate?.finishReason === "MAX_TOKENS") truncated = true;
      if (GEMINI_BLOCKED.has(candidate?.finishReason)) refused = true;
      const usage = chunk.usageMetadata;
      if (usage) {
        inputTokens = usage.promptTokenCount ?? inputTokens;
        outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) || outputTokens;
      }
    }
    yield { type: "end", refused, truncated, inputTokens, outputTokens, model: { provider: "google", id: model.id } };
  }
}

/**
 * Sends each request to its tenant's provider. When the primary model fails or refuses
 * before any text reached the visitor, the turn is retried once on the tenant's fallback.
 */
export class ModelRouter implements ChatModel {
  constructor(
    private providers: Record<Provider, ChatModel>,
    /** For tenants without a model choice (the JSON-file tenants). */
    private fallbackDefault: ChatModel,
  ) {}

  async *stream(request: ChatRequest): AsyncIterable<ModelEvent> {
    const choice = request.model;
    if (!choice) return yield* this.fallbackDefault.stream(request);

    let wrote = false;
    try {
      for await (const event of this.providers[choice.provider].stream(request)) {
        if (event.type === "text") wrote = true;
        if (event.type === "end" && event.refused && !wrote && choice.fallback) {
          log("warn", "model refused, trying fallback", { model: choice.id, fallback: choice.fallback.id });
          yield* this.retry(request, choice, event.inputTokens + event.outputTokens);
          return;
        }
        yield event.type === "end" ? { ...event, model: event.model ?? { provider: choice.provider, id: choice.id } } : event;
      }
    } catch (error) {
      if (wrote || !choice.fallback || request.signal?.aborted) throw error;
      log("warn", "model failed, trying fallback", { model: choice.id, fallback: choice.fallback.id, error });
      yield* this.retry(request, choice, 0);
    }
  }

  private async *retry(request: ChatRequest, choice: ModelChoice, spent: number): AsyncIterable<ModelEvent> {
    const fb = choice.fallback!;
    const model: ModelChoice = { ...choice, provider: fb.provider, id: fb.id, fallback: undefined };
    for await (const event of this.providers[fb.provider].stream({ ...request, model })) {
      // the failed attempt's tokens still count toward the tenant's budget; the reply is the fallback's
      yield event.type === "end" ? { ...event, inputTokens: event.inputTokens + spent, model: event.model ?? { provider: fb.provider, id: fb.id } } : event;
    }
  }
}

/**
 * Development stand-in (APEX_MODEL=echo): streams the top retrieved excerpt word by word,
 * so the widget can be built and tested without an API key or token spend.
 */
export class EchoChatModel implements ChatModel {
  async *stream({ messages, signal }: ChatRequest): AsyncIterable<ModelEvent> {
    const last = messages[messages.length - 1];
    const content = contentText(last.content);
    const doc = /<document [^>]*title="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/document>/.exec(content);
    // shows attachments made it through, without a model to look at them
    const files = [...content.matchAll(/<attachment name="([^"]*)"/g)].map((m) => m[1]);
    const received = files.length ? `📎 ${files.join(", ")} alındı.\n\n` : "";
    const text =
      received +
      (doc
        ? `**${doc[1]}**\n\n${doc[2]} [[used: 1]]`
        : "Bu konuda sitede bir bilgi bulamadım. İsterseniz **Bir insanla konuş** seçeneğiyle ekibe ulaşabilirsiniz. [[no-answer]]");
    for (const word of text.split(/(?<= )/)) {
      if (signal?.aborted) return;
      await new Promise((r) => setTimeout(r, 25));
      yield { type: "text", text: word };
    }
    yield { type: "end", refused: false, truncated: false, inputTokens: 0, outputTokens: 0 };
  }
}
