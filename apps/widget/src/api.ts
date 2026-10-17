import type { PublicWidgetSettings } from "@apex/db/bot-settings";
import { createSSEParser } from "./sse.ts";
import type { Lang } from "./i18n.ts";

/** Dashboard settings; absent for tenants configured in the API's JSON file. */
export type WidgetUi = PublicWidgetSettings;

export interface RemoteConfig {
  siteName: string;
  botName: string;
  defaultLang: Lang;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  greeting: Record<Lang, string>;
  suggestions: Record<Lang, string[]>;
  privacyUrl?: string;
  ui?: WidgetUi;
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

/** A file sent with a message: images as base64 JPEG/PNG/WebP/GIF, text files as text. */
export type Attachment = { kind: "image"; name: string; data: string } | { kind: "text"; name: string; text: string };

/** A hand-off request as the server acknowledged it. */
export interface Ticket {
  id: string;
  createdAt: string;
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
    const get = !init.method || init.method === "GET";
    try {
      res = await fetch(get ? this.url(path) : this.base + path, {
        ...init,
        credentials: "omit",
        // never sent to the host page's server, and nothing about the visitor's page leaks to ours
        referrerPolicy: "strict-origin",
        headers: get ? undefined : { ...(init.body ? { "content-type": "application/json" } : {}), "x-apex-site-key": this.siteKey },
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

  async chat(message: string, conversationId: string | null, onEvent: (e: ChatEvent) => void, signal: AbortSignal, attachments: Attachment[] = []): Promise<void> {
    const res = await this.request("/v1/chat", {
      method: "POST",
      body: JSON.stringify({ message, conversationId, ...(attachments.length ? { attachments } : {}) }),
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

  /** The ticket, or null from an older API that doesn't issue them. */
  async handoff(body: { conversationId: string | null; email: string; name: string; message: string }): Promise<Ticket | null> {
    const res = await (await this.request("/v1/handoff", { method: "POST", body: JSON.stringify(body) })).json().catch(() => ({}));
    const ticket = res?.ticket;
    return ticket && /^[A-Z0-9-]{4,24}$/.test(ticket.id) && !Number.isNaN(Date.parse(ticket.createdAt)) ? { id: ticket.id, createdAt: ticket.createdAt } : null;
  }

  /** KVKK/GDPR erasure of the visitor's own conversation. */
  async deleteConversation(id: string): Promise<void> {
    await this.request(`/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async lead(body: { conversationId: string | null; email: string; name: string; phone: string }): Promise<string> {
    return (await (await this.request("/v1/lead", { method: "POST", body: JSON.stringify(body) })).json()).conversationId;
  }
}
