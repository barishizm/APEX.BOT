import { createSSEParser } from "./sse.ts";
import type { Lang } from "./i18n.ts";

export interface RemoteConfig {
  siteName: string;
  botName: string;
  defaultLang: Lang;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  greeting: Record<Lang, string>;
  suggestions: Record<Lang, string[]>;
  privacyUrl?: string;
}

export interface Source {
  url: string;
  title: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  feedback?: "up" | "down";
}

export type ChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; sources: Source[]; handoff: boolean }
  | { type: "error"; code: string };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(code);
  }
}

export class ApiClient {
  constructor(
    private base: string,
    private siteKey: string,
  ) {}

  // GETs pass the key as a query parameter so they stay "simple" requests without a preflight.
  private url(path: string): string {
    return `${this.base}${path}${path.includes("?") ? "&" : "?"}site_key=${encodeURIComponent(this.siteKey)}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(init.method && init.method !== "GET" ? this.base + path : this.url(path), {
        ...init,
        credentials: "omit",
        headers: init.body ? { "content-type": "application/json", "x-apex-site-key": this.siteKey } : undefined,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw new ApiError("network");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(typeof body.error === "string" ? body.error : "generic", res.status);
    }
    return res;
  }

  async config(): Promise<RemoteConfig> {
    return (await this.request("/v1/widget/config")).json();
  }

  async conversation(id: string): Promise<StoredMessage[]> {
    const body = await (await this.request(`/v1/conversations/${encodeURIComponent(id)}`)).json();
    return body.messages;
  }

  async chat(message: string, conversationId: string | null, onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
    const res = await this.request("/v1/chat", {
      method: "POST",
      body: JSON.stringify({ message, conversationId }),
      signal,
    });
    const parse = createSSEParser((event, data) => onEvent({ type: event, ...JSON.parse(data) } as ChatEvent));
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parse(value);
    }
  }

  async feedback(conversationId: string, messageId: string, rating: "up" | "down"): Promise<void> {
    await this.request("/v1/feedback", { method: "POST", body: JSON.stringify({ conversationId, messageId, rating }) });
  }

  async handoff(body: { conversationId: string | null; email: string; name: string; message: string }): Promise<void> {
    await this.request("/v1/handoff", { method: "POST", body: JSON.stringify(body) });
  }
}
