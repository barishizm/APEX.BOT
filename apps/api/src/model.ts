// The LLM behind the chat. The orchestrator only sees ChatModel, so tests swap in a fake.
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.ts";

export interface ChatRequest {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  signal?: AbortSignal;
}

export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "end"; refused: boolean; truncated: boolean; inputTokens: number; outputTokens: number };

export interface ChatModel {
  stream(request: ChatRequest): AsyncIterable<ModelEvent>;
}

export class ClaudeChatModel implements ChatModel {
  private client: Anthropic;

  constructor(
    private config: Pick<Config, "model" | "effort" | "maxOutputTokens" | "fallbacks">,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async *stream({ system, messages, signal }: ChatRequest): AsyncIterable<ModelEvent> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.config.model,
        max_tokens: this.config.maxOutputTokens,
        system,
        messages,
        // Effort is configurable per deployment (APEX_EFFORT).
        output_config: { effort: this.config.effort },
        // On a safety-classifier refusal the API re-runs the turn on Anthropic's recommended fallback model.
        ...(this.config.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
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
    };
  }
}

/**
 * Development stand-in (APEX_MODEL=echo): streams the top retrieved excerpt word by word,
 * so the widget can be built and tested without an API key or token spend.
 */
export class EchoChatModel implements ChatModel {
  async *stream({ messages, signal }: ChatRequest): AsyncIterable<ModelEvent> {
    const last = messages[messages.length - 1];
    const content = typeof last.content === "string" ? last.content : "";
    const doc = /<document [^>]*title="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/document>/.exec(content);
    const text = doc
      ? `**${doc[1]}**\n\n${doc[2]}`
      : "Bu konuda sitede bir bilgi bulamadım. İsterseniz **Bir insanla konuş** seçeneğiyle ekibe ulaşabilirsiniz.";
    for (const word of text.split(/(?<= )/)) {
      if (signal?.aborted) return;
      await new Promise((r) => setTimeout(r, 25));
      yield { type: "text", text: word };
    }
    yield { type: "end", refused: false, truncated: false, inputTokens: 0, outputTokens: 0 };
  }
}
