import { ApiClient, ApiError, type RemoteConfig, type Source, type StoredMessage, type WidgetUi } from "./api.ts";
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
  sparkle: '<path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2Z"/><path d="M19 3v4M21 5h-4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  headset: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
};

const FONTS = {
  rounded: 'ui-rounded,"SF Pro Rounded",Quicksand,Nunito,system-ui,sans-serif',
  serif: "ui-serif,Georgia,Cambria,serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
};
const WIDTHS = { compact: 340, standard: 384, wide: 440 };
const SIZES = { small: 48, medium: 56, large: 64 };

/** The conversation id's storage, per the "remember the conversation" setting. */
function pickStorage(ui?: WidgetUi): Storage | null {
  try {
    const mode = ui?.behavior.persistence ?? "tab";
    return mode === "none" ? null : mode === "browser" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

/** True when the widget should stay hidden on this page. */
export function hiddenHere(ui: WidgetUi | undefined, path = location.pathname): boolean {
  return !!ui?.behavior.hiddenPaths.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

const media = (query: string) => (typeof matchMedia === "function" ? matchMedia(query) : null);

// A short two-tone chime, synthesized so the bundle carries no audio file.
function chime(): void {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + 0.35);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    // audio blocked; replies stay silent
  }
}

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
const PHONE = /^\+?[\d\s().-]{7,40}$/;

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
  private storage: Storage | null;
  private ui?: WidgetUi;
  private handoffOn: boolean;
  private teaser: HTMLElement | null = null;

  constructor(
    private api: ApiClient,
    private cfg: RemoteConfig,
    private opts: UserOptions,
    siteKey: string,
  ) {
    const ui = (this.ui = cfg.ui);
    this.lang = pickLang(opts.lang ?? (ui?.general.languageMode === "fixed" ? cfg.defaultLang : undefined), cfg.defaultLang);
    const t: Strings = (this.t = { ...strings[this.lang] });
    if (ui) {
      t.placeholder = ui.messages.placeholder[this.lang] || t.placeholder;
      t.disclaimer = ui.messages.showDisclaimer ? ui.messages.disclaimer[this.lang] || t.disclaimer : "";
    }
    this.handoffOn = ui ? ui.handoff.enabled : true;
    this.storageKey = `apex:${siteKey}:conversation`;
    this.storage = pickStorage(ui);
    this.conversationId = this.load();

    const primary = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(opts.theme?.primary ?? cfg.primaryColor)
      ? (opts.theme?.primary ?? cfg.primaryColor)
      : "#0c0c09";
    const position = opts.theme?.position ?? cfg.position;
    const a = ui?.appearance;

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

    const links = [
      cfg.privacyUrl && h("a", { href: cfg.privacyUrl, target: "_blank", rel: "noopener noreferrer" }, t.privacy),
      this.handoffOn && h("button", { type: "button", onclick: () => this.showHandoff() }, t.human),
    ].filter((x): x is HTMLAnchorElement | HTMLButtonElement => !!x);
    const footer = h(
      "div",
      { class: "foot" },
      t.disclaimer,
      ...links.flatMap((l, i) => [i || t.disclaimer ? (i ? " · " : " ") : "", l]),
      a?.showBranding !== false && ui && h("span", { class: "brand" }, t.powered),
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

    const avatar = h("div", { class: "avatar", "aria-hidden": "true" });
    if (a?.avatar === "image" && a.avatarUrl) avatar.append(h("img", { src: a.avatarUrl, alt: "" }));
    else if (a?.avatar === "icon") avatar.append(icon("bot"));
    else avatar.append(cfg.botName.slice(0, 1).toUpperCase());
    const header = h(
      "div",
      { class: "head" },
      avatar,
      h("div", { class: "title" }, h("strong", {}, cfg.botName), h("span", {}, ui?.general.subtitle[this.lang] || `${t.ai} · ${cfg.siteName}`)),
      h("button", { class: "icon", type: "button", "aria-label": t.newChat, title: t.newChat, onclick: () => this.reset() }, icon("reset")),
      h("button", { class: "icon", type: "button", "aria-label": t.close, title: t.close, onclick: () => this.close(true) }, icon("close")),
    );

    this.panel = h("section", { class: "panel", id: "apex-panel", role: "dialog", "aria-label": `${cfg.botName}, ${t.ai}`, hidden: true }, header, this.chatView);
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close(true);
    });

    this.launcher = h("button", { class: "launcher", type: "button", "aria-label": t.open, "aria-expanded": "false", "aria-controls": "apex-panel", onclick: () => this.toggle() });
    this.paintLauncher();

    this.root = h("div", { class: "root", "data-pos": position === "bottom-left" ? "left" : "right", lang: this.lang, "data-float": ui?.behavior.mobileFullscreen === false }, this.panel, this.launcher);
    const style = this.root.style;
    style.setProperty("--p", primary);
    style.setProperty("--on-p", readableOn(primary));
    if (a) {
      style.setProperty("--cx", `${a.offsetX}px`);
      style.setProperty("--cy", `${a.offsetY}px`);
      style.setProperty("--ls", `${SIZES[a.launcherSize]}px`);
      style.setProperty("--pw", `${WIDTHS[a.panelWidth]}px`);
      style.setProperty("--r", `${a.radius}px`);
      if (a.font !== "system") style.setProperty("--font", FONTS[a.font]);
    }
    // "auto" follows the visitor's device, live
    const mq = media("(prefers-color-scheme: dark)");
    const theme = () => this.root.classList.toggle("dk", a?.theme === "dark" || (a?.theme !== "light" && !!mq?.matches));
    theme();
    mq?.addEventListener?.("change", theme);

    const teaser = ui?.behavior.teaser[this.lang];
    if (teaser && !this.flag("teaser")) {
      this.teaser = h(
        "div",
        { class: "teaser", role: "status" },
        h("span", { onclick: () => this.open() }, teaser),
        h("button", { class: "x", type: "button", "aria-label": t.dismiss, onclick: () => this.hideTeaser() }, icon("close")),
      );
      this.root.append(this.teaser);
    }
  }

  private paintLauncher(): void {
    const label = !this.isOpen && this.ui?.appearance.launcherLabel[this.lang];
    this.launcher.className = label ? "launcher lbl" : "launcher";
    const ap = this.ui?.appearance;
    const glyph = this.isOpen
      ? icon("chevron")
      : ap?.launcherIcon === "custom" && ap.launcherImage
        ? h("img", { src: ap.launcherImage, alt: "" })
        : icon(ap?.launcherIcon === "custom" || !ap ? "chat" : ap.launcherIcon);
    this.launcher.replaceChildren(glyph, label || "");
  }

  private hideTeaser(): void {
    this.teaser?.remove();
    this.teaser = null;
    this.flag("teaser", true);
  }

  /** Once-per-visit markers (teaser dismissed, auto-open done, lead form handled). */
  private flag(name: string, set?: boolean): boolean {
    const key = `${this.storageKey}:${name}`;
    try {
      if (set) sessionStorage.setItem(key, "1");
      return !!sessionStorage.getItem(key);
    } catch {
      return !!set;
    }
  }

  mount(): void {
    this.host.id = "apex-bot";
    const shadow = this.host.attachShadow({ mode: "closed" });
    shadow.append(h("style", {}, css), this.root);
    document.body.append(this.host);

    const b = this.ui?.behavior;
    if (b?.autoOpen === "delay" && !this.flag("auto") && (b.autoOpenOnMobile || !media("(max-width: 480px)")?.matches)) {
      setTimeout(() => {
        // the visitor may have opened and closed it in the meantime
        if (!this.flag("auto")) this.open();
        this.flag("auto", true);
      }, b.autoOpenDelay * 1000);
    }
  }

  // ----- public API -----

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panel.hidden = false;
    this.root.toggleAttribute("data-open", true);
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", this.t.close);
    this.paintLauncher();
    this.flag("auto", true);
    if (this.teaser) this.hideTeaser();
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
    this.paintLauncher();
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
    await this.ready;
    if (this.leadPending()) return;
    if (!this.chatView.isConnected) this.backToChat();
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
            if (this.ui?.behavior.soundOnReply && (document.hidden || !this.isOpen)) chime();
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
    const h = this.ui?.handoff;
    if (h?.leadCapture === "before-chat" && history.length === 0 && !this.flag("lead")) this.showLead();
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
    const show = this.ui?.behavior;
    if (show?.showSources === false) sources = [];
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
    if (handoff && this.handoffOn) {
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
    if (show?.showFeedback !== false) meta.append(h("div", { class: "rate" }, up, down, status));
    if (meta.childElementCount) after.after(meta);
    this.scroll();
  }

  private showError(bubble: HTMLDivElement, code: string, retry: () => void): void {
    const t = this.t;
    bubble.className = "msg bot error";
    bubble.replaceChildren(h("p", {}, t.errors[code as keyof Strings["errors"]] ?? t.errors.generic));
    let action: HTMLButtonElement | null = null;
    if ((code === "budget_exhausted" || code === "refused") && this.handoffOn) {
      action = h("button", { class: "chip", type: "button", onclick: () => this.showHandoff() }, t.human);
    } else if (code === "conversation_full") {
      action = h("button", { class: "chip", type: "button", onclick: () => this.reset() }, t.newChat);
    } else if (code === "network" || code === "generic" || code === "upstream" || code === "rate_limited") {
      action = h("button", { class: "chip", type: "button", onclick: retry }, t.retry);
    }
    if (action) bubble.after(h("div", { class: "meta" }, h("div", {}, action)));
    this.scroll();
  }

  /** Contact form before the first message ("Lead capture: before the chat"). */
  private showLead(): void {
    const t = this.t;
    const cfg = this.ui!.handoff;
    const req = cfg.leadRequired;
    const field = (type: string, auto: string) => h("input", { type, autocomplete: auto, maxlength: type === "tel" ? 40 : 254, required: req });
    const email = h("input", { type: "email", required: true, autocomplete: "email", maxlength: 254, value: this.identity.email || undefined });
    const name = cfg.leadFields.name ? field("text", "name") : null;
    const phone = cfg.leadFields.phone ? field("tel", "tel") : null;
    const error = h("p", { class: "err", role: "alert" });
    const submit = h("button", { class: "btn primary", type: "submit" }, t.start);
    const done = () => {
      this.flag("lead", true);
      this.backToChat();
    };
    const fail = (el: HTMLInputElement, msg: string) => {
      error.textContent = msg;
      el.setAttribute("aria-invalid", "true");
      el.focus();
    };
    const form = h(
      "form",
      {
        class: "form",
        novalidate: true,
        onsubmit: async (e: Event) => {
          e.preventDefault();
          for (const el of [email, name, phone]) el?.removeAttribute("aria-invalid");
          const v = (el: HTMLInputElement | null) => el?.value.trim() ?? "";
          if (!EMAIL.test(v(email))) return fail(email, t.invalidEmail);
          if (req && name && !v(name)) return fail(name, t.required);
          if (phone && (v(phone) || req) && !PHONE.test(v(phone))) return fail(phone, req && !v(phone) ? t.required : t.invalidPhone);
          error.textContent = "";
          submit.disabled = true;
          try {
            this.save(await this.api.lead({ conversationId: this.conversationId, email: v(email), name: v(name), phone: v(phone) }));
            this.identify({ email: v(email), name: v(name) });
            this.emit("lead", { email: v(email), name: v(name), phone: v(phone) });
            done();
          } catch (err) {
            const code = err instanceof ApiError ? err.code : "generic";
            error.textContent = t.errors[code as keyof Strings["errors"]] ?? t.errors.generic;
            submit.disabled = false;
          }
        },
      },
      h("h2", {}, t.leadTitle),
      h("p", {}, t.leadIntro),
      h("label", {}, t.email, email),
      name && h("label", {}, req ? t.nameReq : t.name, name),
      phone && h("label", {}, req ? t.phoneReq : t.phone, phone),
      error,
      h("div", { class: "row" }, submit, !req && h("button", { class: "btn ghost", type: "button", onclick: done }, t.skip)),
    );
    (this.panel.querySelector(".form") ?? this.chatView).replaceWith(form);
    email.focus();
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

  /** A required lead form is still open: no route back to the chat skips it. */
  private leadPending(): boolean {
    const h = this.ui?.handoff;
    return h?.leadCapture === "before-chat" && h.leadRequired && !this.flag("lead") && !!this.panel.querySelector(".form");
  }

  private backToChat(): void {
    if (this.leadPending()) return;
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

  // Session storage (the default) keeps the conversation within the tab; local storage
  // across visits; "none" not at all.
  private load(): string | null {
    try {
      return this.storage?.getItem(this.storageKey) ?? null;
    } catch {
      return null;
    }
  }

  private save(id: string | null): void {
    this.conversationId = id;
    try {
      if (id) this.storage?.setItem(this.storageKey, id);
      else this.storage?.removeItem(this.storageKey);
    } catch {
      // storage blocked; the conversation just won't survive a reload
    }
  }
}
