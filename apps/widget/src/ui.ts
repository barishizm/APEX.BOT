import { ApiClient, ApiError, type RemoteConfig, type Source, type StoredMessage } from "./api.ts";
import { pickLang, strings, type Lang, type Strings } from "./i18n.ts";
import { renderMarkdown } from "./markdown.ts";
import { css } from "./styles.ts";

/** Optional page-level overrides from `window.Apex = {...}` set before the script loads. */
export interface UserOptions {
  theme?: { primary?: string; position?: "bottom-right" | "bottom-left" };
  greeting?: string;
  lang?: "auto" | Lang;
  suggestions?: string[];
}

type Listener = (payload?: unknown) => void;
type Kid = Node | string | false | null | undefined;

// Icon paths adapted from Lucide (ISC license).
const ICONS = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  up: '<path d="M7 10v12"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/>',
  down: '<path d="M17 14V2"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9Z"/>',
};

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name]; // static, trusted markup
  return svg;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = String(value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

function readableOn(hex: string): string {
  const full = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0c0c09" : "#ffffff";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Widget {
  private t: Strings;
  private lang: Lang;
  private host = document.createElement("div");
  private root: HTMLDivElement;
  private launcher: HTMLButtonElement;
  private panel: HTMLElement;
  private chatView: HTMLDivElement;
  private log: HTMLDivElement;
  private suggest: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private isOpen = false;
  private busy = false;
  private controller: AbortController | null = null;
  private ready: Promise<void> | null = null;
  private conversationId: string | null;
  private listeners = new Map<string, Set<Listener>>();
  private identity = { name: "", email: "" };
  private storageKey: string;

  constructor(
    private api: ApiClient,
    private cfg: RemoteConfig,
    private opts: UserOptions,
    siteKey: string,
  ) {
    this.lang = pickLang(opts.lang, cfg.defaultLang);
    this.t = strings[this.lang];
    this.storageKey = `apex:${siteKey}:conversation`;
    this.conversationId = this.load();

    const t = this.t;
    const primary = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(opts.theme?.primary ?? cfg.primaryColor)
      ? (opts.theme?.primary ?? cfg.primaryColor)
      : "#0c0c09";
    const position = opts.theme?.position ?? cfg.position;

    this.log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-label": cfg.botName });
    this.suggest = h("div", { class: "suggest" });
    this.input = h("textarea", {
      rows: 1,
      maxlength: 1000,
      placeholder: t.placeholder,
      "aria-label": t.placeholder,
      oninput: () => this.autogrow(),
      onkeydown: ((e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          void this.send(this.input.value);
        }
      }) as EventListener,
    });
    this.sendBtn = h("button", { class: "send", type: "submit", "aria-label": t.send, disabled: true }, icon("send"));

    const footer = h(
      "div",
      { class: "foot" },
      t.disclaimer,
      " ",
      cfg.privacyUrl && h("a", { href: cfg.privacyUrl, target: "_blank", rel: "noopener noreferrer" }, t.privacy),
      cfg.privacyUrl && " · ",
      h("button", { type: "button", onclick: () => this.showHandoff() }, t.human),
    );

    this.chatView = h(
      "div",
      { class: "view" },
      this.log,
      this.suggest,
      h(
        "form",
        {
          class: "compose",
          onsubmit: (e: Event) => {
            e.preventDefault();
            void this.send(this.input.value);
          },
        },
        this.input,
        this.sendBtn,
      ),
      footer,
    );

    const header = h(
      "div",
      { class: "head" },
      h("div", { class: "avatar", "aria-hidden": "true" }, cfg.botName.slice(0, 1).toUpperCase()),
      h("div", { class: "title" }, h("strong", {}, cfg.botName), h("span", {}, `${t.ai} · ${cfg.siteName}`)),
      h("button", { class: "icon", type: "button", "aria-label": t.newChat, title: t.newChat, onclick: () => this.reset() }, icon("reset")),
      h("button", { class: "icon", type: "button", "aria-label": t.close, title: t.close, onclick: () => this.close(true) }, icon("close")),
    );

    this.panel = h("section", { class: "panel", id: "apex-panel", role: "dialog", "aria-label": `${cfg.botName}, ${t.ai}`, hidden: true }, header, this.chatView);
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close(true);
    });

    this.launcher = h("button", { class: "launcher", type: "button", "aria-label": t.open, "aria-expanded": "false", "aria-controls": "apex-panel", onclick: () => this.toggle() }, icon("chat"));

    this.root = h("div", { class: "root", "data-pos": position === "bottom-left" ? "left" : "right", lang: this.lang }, this.panel, this.launcher);
    this.root.style.setProperty("--p", primary);
    this.root.style.setProperty("--on-p", readableOn(primary));
  }

  mount(): void {
    this.host.id = "apex-bot";
    const shadow = this.host.attachShadow({ mode: "closed" });
    shadow.append(h("style", {}, css), this.root);
    document.body.append(this.host);
  }

  // ----- public API -----

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panel.hidden = false;
    this.root.toggleAttribute("data-open", true);
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", this.t.close);
    this.launcher.replaceChildren(icon("chevron"));
    this.ready ??= this.hydrate();
    if (this.chatView.isConnected) this.input.focus();
    this.emit("open");
  }

  close(returnFocus = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.hidden = true;
    this.root.toggleAttribute("data-open", false);
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", this.t.open);
    this.launcher.replaceChildren(icon("chat"));
    if (returnFocus) this.launcher.focus();
    this.emit("close");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  identify(person: { name?: string; email?: string }): void {
    this.identity = { name: person.name ?? this.identity.name, email: person.email ?? this.identity.email };
  }

  on(event: string, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  async send(raw: string): Promise<void> {
    const text = String(raw ?? "").trim();
    if (!text || this.busy) return;
    this.open();
    if (!this.chatView.isConnected) this.backToChat();
    await this.ready;
    this.busy = true;
    this.input.value = "";
    this.autogrow();
    this.suggest.replaceChildren();

    const userBubble = this.addUser(text);
    const bubble = this.addBot("");
    bubble.append(h("div", { class: "typing", role: "status", "aria-label": this.t.typing }, h("i"), h("i"), h("i")));
    this.scroll();
    this.log.setAttribute("aria-busy", "true");

    let answer = "";
    let frame = 0;
    let finished = false;
    let failure: string | null = null;
    const paint = () => {
      frame = 0;
      bubble.replaceChildren(renderMarkdown(answer));
      this.scroll();
    };

    const controller = (this.controller = new AbortController());
    try {
      await this.api.chat(
        text,
        this.conversationId,
        (event) => {
          if (event.type === "meta") this.save(event.conversationId);
          else if (event.type === "delta") {
            answer += event.text;
            frame ||= requestAnimationFrame(paint);
          } else if (event.type === "done") {
            cancelAnimationFrame(frame);
            paint();
            this.addMeta(bubble, event.messageId, event.sources, event.handoff);
            finished = true;
            this.emit("message", { text: answer, sources: event.sources });
          } else if (event.type === "error") failure = event.code;
        },
        controller.signal,
      );
      if (!finished) throw new ApiError(failure ?? "network");
    } catch (error) {
      cancelAnimationFrame(frame);
      if (controller.signal.aborted) return;
      this.showError(bubble, error instanceof ApiError ? error.code : "generic", () => {
        userBubble.remove();
        bubble.nextElementSibling?.classList.contains("meta") && bubble.nextElementSibling.remove();
        bubble.remove();
        void this.send(text);
      });
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.busy = false;
        this.log.removeAttribute("aria-busy");
        this.updateSend();
      }
    }
  }

  // ----- internals -----

  private async hydrate(): Promise<void> {
    this.addBot(this.opts.greeting ?? this.cfg.greeting[this.lang]);
    let history: StoredMessage[] = [];
    if (this.conversationId) {
      try {
        history = await this.api.conversation(this.conversationId);
      } catch {
        this.save(null);
      }
    }
    for (const m of history) {
      if (m.role === "user") this.addUser(m.content);
      else this.addMeta(this.addBot(m.content), m.id, m.sources ?? [], false, m.feedback);
    }
    if (history.length === 0) this.renderSuggestions();
    this.scroll();
  }

  private renderSuggestions(): void {
    const list = this.opts.suggestions ?? this.cfg.suggestions[this.lang] ?? [];
    this.suggest.replaceChildren(
      ...list.slice(0, 4).map((s) => h("button", { class: "chip", type: "button", onclick: () => void this.send(s) }, s)),
    );
  }

  private reset(): void {
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
    this.log.removeAttribute("aria-busy");
    this.save(null);
    this.log.replaceChildren();
    if (!this.chatView.isConnected) this.backToChat();
    this.ready = this.hydrate();
    this.updateSend();
    this.input.focus();
  }

  private addUser(text: string): HTMLDivElement {
    const el = h("div", { class: "msg user" }, text);
    this.log.append(el);
    this.scroll();
    return el;
  }

  private addBot(markdown: string): HTMLDivElement {
    const el = h("div", { class: "msg bot" });
    el.append(renderMarkdown(markdown));
    this.log.append(el);
    return el;
  }

  private addMeta(after: HTMLElement, messageId: string, sources: Source[], handoff: boolean, feedback?: "up" | "down"): void {
    const t = this.t;
    const meta = h("div", { class: "meta" });
    if (sources.length) {
      meta.append(
        h(
          "div",
          { class: "sources" },
          h("span", {}, `${t.sources}:`),
          ...sources.map((s) => h("a", { class: "chip", href: s.url, target: "_blank", rel: "noopener noreferrer", title: s.url }, s.title)),
        ),
      );
    }
    if (handoff) {
      meta.append(h("div", { class: "sources" }, h("span", {}, t.humanOffer), h("button", { class: "chip", type: "button", onclick: () => this.showHandoff() }, t.human)));
    }

    const conversationId = this.conversationId;
    const status = h("span", { role: "status" });
    const rate = (rating: "up" | "down") => {
      for (const b of [up, down]) b.disabled = true;
      (rating === "up" ? up : down).setAttribute("aria-pressed", "true");
      status.textContent = t.thanks;
      if (conversationId) this.api.feedback(conversationId, messageId, rating).catch(() => {});
    };
    const up = h("button", { type: "button", "aria-label": t.helpful, title: t.helpful, "aria-pressed": String(feedback === "up"), disabled: !!feedback, onclick: () => rate("up") }, icon("up"));
    const down = h("button", { type: "button", "aria-label": t.notHelpful, title: t.notHelpful, "aria-pressed": String(feedback === "down"), disabled: !!feedback, onclick: () => rate("down") }, icon("down"));
    meta.append(h("div", { class: "rate" }, up, down, status));
    after.after(meta);
    this.scroll();
  }

  private showError(bubble: HTMLDivElement, code: string, retry: () => void): void {
    const t = this.t;
    bubble.className = "msg bot error";
    bubble.replaceChildren(h("p", {}, t.errors[code as keyof Strings["errors"]] ?? t.errors.generic));
    let action: HTMLButtonElement | null = null;
    if (code === "budget_exhausted" || code === "refused") {
      action = h("button", { class: "chip", type: "button", onclick: () => this.showHandoff() }, t.human);
    } else if (code === "conversation_full") {
      action = h("button", { class: "chip", type: "button", onclick: () => this.reset() }, t.newChat);
    } else if (code === "network" || code === "generic" || code === "upstream" || code === "rate_limited") {
      action = h("button", { class: "chip", type: "button", onclick: retry }, t.retry);
    }
    if (action) bubble.after(h("div", { class: "meta" }, h("div", {}, action)));
    this.scroll();
  }

  private showHandoff(): void {
    const t = this.t;
    this.open();
    const email = h("input", { type: "email", required: true, autocomplete: "email", maxlength: 254, value: this.identity.email || undefined });
    const name = h("input", { type: "text", autocomplete: "name", maxlength: 100, value: this.identity.name || undefined });
    const note = h("textarea", { rows: 3, maxlength: 2000 });
    const error = h("p", { class: "err", role: "alert" });
    const submit = h("button", { class: "btn primary", type: "submit" }, t.submit);
    const cancel = h("button", { class: "btn ghost", type: "button", onclick: () => this.backToChat() }, t.cancel);

    const form = h(
      "form",
      {
        class: "form",
        novalidate: true,
        onsubmit: async (e: Event) => {
          e.preventDefault();
          if (!EMAIL.test(email.value.trim())) {
            error.textContent = t.invalidEmail;
            email.setAttribute("aria-invalid", "true");
            email.focus();
            return;
          }
          error.textContent = "";
          submit.disabled = true;
          submit.textContent = t.sending;
          try {
            await this.api.handoff({ conversationId: this.conversationId, email: email.value.trim(), name: name.value.trim(), message: note.value.trim() });
            this.identity = { name: name.value.trim(), email: email.value.trim() };
            const back = h("button", { class: "btn ghost", type: "button", onclick: () => this.backToChat() }, t.back);
            form.replaceChildren(h("h2", {}, t.handoffTitle), h("p", { role: "status" }, t.handoffSent), h("div", { class: "row" }, back));
            back.focus();
            this.emit("handoff");
          } catch (err) {
            const code = err instanceof ApiError ? err.code : "generic";
            error.textContent = t.errors[code as keyof Strings["errors"]] ?? t.errors.generic;
            submit.disabled = false;
            submit.textContent = t.submit;
          }
        },
      },
      h("h2", {}, t.handoffTitle),
      h("p", {}, t.handoffIntro),
      h("label", {}, t.email, email),
      h("label", {}, t.name, name),
      h("label", {}, t.note, note),
      error,
      h("div", { class: "row" }, submit, cancel),
    );
    const current = this.panel.querySelector(".form");
    (current ?? this.chatView).replaceWith(form);
    email.focus();
  }

  private backToChat(): void {
    this.panel.querySelector(".form")?.replaceWith(this.chatView);
    this.input.focus();
    this.scroll();
  }

  private autogrow(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight + 2, 132)}px`;
    this.updateSend();
  }

  private updateSend(): void {
    this.sendBtn.disabled = this.busy || !this.input.value.trim();
  }

  private scroll(): void {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private emit(event: string, payload?: unknown): void {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        fn(payload);
      } catch (error) {
        console.error("[Apex] listener failed", error);
      }
    }
  }

  // Session storage keeps the conversation across page navigations within the tab only.
  private load(): string | null {
    try {
      return sessionStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private save(id: string | null): void {
    this.conversationId = id;
    try {
      if (id) sessionStorage.setItem(this.storageKey, id);
      else sessionStorage.removeItem(this.storageKey);
    } catch {
      // storage blocked; the conversation just won't survive a reload
    }
  }
}
