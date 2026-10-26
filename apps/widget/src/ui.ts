import { ApiClient, ApiError, type RemoteConfig, type Source, type StoredMessage, type Ticket, type WidgetUi } from "./api.ts";
import { pickLang, strings, type Lang, type Strings } from "./i18n.ts";
import { renderMarkdown } from "./markdown.ts";
import { ACCEPT, FileError, LOCALES, MAX_FILES, prepareFile, recognition, speakable, type FileProblem, type Prepared, type Recognition, type RecognitionCtor, type RecognitionResultEvent } from "./media.ts";
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
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  compose: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  end: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="m15 9-6 6M9 9l6 6"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clip: '<path d="m16 6-8.4 8.6a2 2 0 0 0 2.8 2.8l8.4-8.6a4 4 0 0 0-5.6-5.6l-8.4 8.6a6 6 0 1 0 8.5 8.5L21 12.3"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  wave: '<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/>',
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
/** The visitor asked for less motion: transitions are skipped, not just shortened. */
const still = () => !!media("(prefers-reduced-motion: reduce)")?.matches;

/** Runs a short entrance animation where the Web Animations API exists and motion is welcome. */
function enter(el: Element, from: Keyframe, ms = 220): void {
  if (!still() && typeof el.animate === "function") el.animate([from, { opacity: 1, transform: "none" }], { duration: ms, easing: "cubic-bezier(.2,.8,.2,1)" });
}

/** Only web links: a javascript: or data: URL from settings or sources never becomes a link. */
const webUrl = (url: unknown): string | undefined => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined);

// Matches the API's own check (no whitespace or RFC 5322 specials), so the form never sends what the API rejects
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE = /^\+?[\d\s().-]{7,40}$/;
const TICKET_ID = /^[A-Z0-9-]{4,24}$/;
const MAX_TICKETS = 20;
// how long the panel's closing transition runs (styles.ts) before it is taken out of the layout
const CLOSE_MS = 220;

interface StoredTicket extends Ticket {
  email: string;
  note: string;
}

/** Storage is the visitor's, but other scripts on the page can write to it: only well-formed entries are read. */
function isTicket(x: unknown): x is StoredTicket {
  const t = x as StoredTicket;
  return (
    !!t &&
    typeof t.id === "string" &&
    TICKET_ID.test(t.id) &&
    typeof t.createdAt === "string" &&
    !Number.isNaN(Date.parse(t.createdAt)) &&
    typeof t.email === "string" &&
    t.email.length <= 254 &&
    typeof t.note === "string" &&
    t.note.length <= 280
  );
}

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

export class Widget {
  private t: Strings;
  private lang: Lang;
  private host = document.createElement("div");
  private root: HTMLDivElement;
  private launcher: HTMLButtonElement;
  private panel: HTMLElement;
  private head: HTMLDivElement;
  private chatView: HTMLDivElement;
  /** What the panel shows under the header: the chat, a form or a pane. */
  private view: HTMLElement;
  private log: HTMLDivElement;
  private jump: HTMLButtonElement;
  private suggest: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  /** What the round button does right now (its icon follows). */
  private sendMode: "send" | "voice" | "stop" | "" = "";
  private dock: HTMLDivElement;
  private notice: HTMLElement | null = null;
  private composeError: HTMLParagraphElement;
  private errorTimer: ReturnType<typeof setTimeout> | undefined;
  private fileList: HTMLDivElement;
  private fileInput: HTMLInputElement | null = null;
  /** Files picked for the next message; `prepared` is null while one is still being read. */
  private files: { prepared: Prepared | null; chip: HTMLElement }[] = [];
  private canAttach: boolean;
  /** Speech recognition, when the browser has it and the bot allows voice. */
  private voice: RecognitionCtor | null;
  private micBtn: HTMLButtonElement | null = null;
  private rec: Recognition | null = null;
  /** Listening in voice mode: what is heard is sent, and the reply read aloud. */
  private voiceListening = false;
  private speaking = false;
  private menuWrap: HTMLDivElement;
  private menuBtn: HTMLButtonElement;
  private menu: HTMLDivElement;
  private items: { fresh: HTMLButtonElement; end: HTMLButtonElement; human?: HTMLButtonElement; tickets: HTMLButtonElement };
  private ticketCount: HTMLSpanElement;
  private isOpen = false;
  private busy = false;
  /** "End chat" was chosen: the panel shows the closing pane until a new chat starts. */
  private ended = false;
  /** The API said the site's assistant is out of service: the composer stays locked until the page reloads. */
  private outOfService = false;
  /** Following the newest message; false once the visitor scrolls up to read. */
  private pinned = true;
  private lastTop = 0;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private ticketsFrom: HTMLElement | null = null;
  private controller: AbortController | null = null;
  private ready: Promise<void> | null = null;
  private conversationId: string | null;
  private listeners = new Map<string, Set<Listener>>();
  private identity = { name: "", email: "" };
  private storageKey: string;
  private ticketsKey: string;
  private storage: Storage | null;
  private tickets: StoredTicket[];
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
    this.ticketsKey = `apex:${siteKey}:tickets`;
    this.storage = pickStorage(ui);
    this.conversationId = this.load();
    this.tickets = this.loadTickets();

    const primary = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(opts.theme?.primary ?? cfg.primaryColor)
      ? (opts.theme?.primary ?? cfg.primaryColor)
      : "#0c0c09";
    const position = opts.theme?.position ?? cfg.position;
    const a = ui?.appearance;

    this.log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-label": cfg.botName });
    this.log.addEventListener("scroll", () => this.onScroll(), { passive: true });
    this.jump = h("button", { class: "jump", type: "button", "aria-label": t.jump, title: t.jump, onclick: () => this.scroll(true, true) }, icon("chevron"));
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
          void this.submit();
        }
      }) as EventListener,
    });

    // Composer: a pill with paperclip, text, microphone and one round button that sends,
    // starts voice chat when there is nothing to send, or stops a reply being read aloud.
    this.canAttach = ui?.behavior.attachments !== false;
    this.voice = ui?.behavior.voiceInput === false ? null : recognition();
    this.sendBtn = h("button", { class: "send", type: "button", onclick: () => this.primaryAction() });
    this.fileList = h("div", { class: "files" });
    this.composeError = h("p", { class: "cerr", role: "alert" });
    const clip = this.canAttach && h("button", { class: "tool", type: "button", "aria-label": t.attach, title: t.attach, onclick: () => this.pickFiles() }, icon("clip"));
    if (this.voice) {
      this.micBtn = h("button", { class: "tool", type: "button", "aria-label": t.dictate, title: t.dictate, "aria-pressed": "false", onclick: () => this.dictate() }, icon("mic"));
    }
    const compose = h(
      "form",
      {
        class: "compose",
        onsubmit: (e: Event) => {
          e.preventDefault();
          void this.submit();
        },
      },
      this.fileList,
      h("div", { class: "bar" }, clip, this.input, this.micBtn, this.sendBtn),
    );

    // The privacy policy in one short line, dismissible for the rest of the visit
    const privacy = webUrl(cfg.privacyUrl);
    if (privacy && !this.flag("notice", false, true)) {
      const line = h("p", {}, t.privacyPre, h("a", { href: privacy, target: "_blank", rel: "noopener noreferrer" }, t.privacyLink), t.privacyPost);
      // a narrow panel or a long translation can still cut it; the full sentence stays on hover
      line.title = line.textContent!;
      this.notice = h(
        "div",
        { class: "notice" },
        h("div", {}, line, h("button", { class: "x", type: "button", "aria-label": t.dismiss, title: t.dismiss, onclick: () => this.hideNotice() }, icon("close"))),
      );
    }
    this.dock = h("div", { class: this.notice ? "dock" : "dock bare" }, this.notice, this.composeError, compose);

    this.chatView = h(
      "div",
      { class: "view" },
      h("div", { class: "lw" }, this.log, this.jump),
      this.suggest,
      this.dock,
      // The AI disclaimer sits with the branding, small, under the composer. With the disclaimer
      // turned off the visitor is still told it's an AI (EU AI Act, art. 50).
      h("div", { class: "foot" }, h("span", {}, t.disclaimer || t.ai), a?.showBranding !== false && ui && h("span", {}, t.powered)),
    );
    this.view = this.chatView;
    this.updateSend();

    if (this.canAttach) {
      // pasted screenshots and files dropped anywhere on the chat
      this.input.addEventListener("paste", (e) => {
        const files = [...(e.clipboardData?.files ?? [])];
        if (!files.length) return;
        e.preventDefault();
        this.addFiles(files);
      });
      const dragging = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
      this.chatView.addEventListener("dragover", (e) => {
        if (!dragging(e)) return;
        e.preventDefault();
        this.chatView.classList.add("drop");
      });
      this.chatView.addEventListener("dragleave", (e) => {
        if (!this.chatView.contains(e.relatedTarget as Node | null)) this.chatView.classList.remove("drop");
      });
      this.chatView.addEventListener("drop", (e) => {
        this.chatView.classList.remove("drop");
        if (!dragging(e)) return;
        e.preventDefault();
        this.addFiles([...e.dataTransfer!.files]);
      });
    }

    // The logo at the left of the header; an initial or the bot icon on a tile otherwise
    const initial = cfg.botName.slice(0, 1).toUpperCase();
    const avatar = h("div", { class: "avatar", "aria-hidden": "true" });
    if (a?.avatar === "image" && a.avatarUrl) {
      const logo = h("img", { src: a.avatarUrl, alt: "" });
      avatar.classList.add("logo");
      // blocked by the host page's CSP, or gone: the initial stands in
      logo.addEventListener("error", () => (avatar.classList.remove("logo"), avatar.replaceChildren(initial)), { once: true });
      avatar.append(logo);
    } else avatar.append(a?.avatar === "icon" ? icon("bot") : initial);

    // "More options": a menu button (WAI-ARIA APG pattern) next to close
    const item = (label: string, glyph: keyof typeof ICONS, action: () => void, ...extra: Kid[]) =>
      h(
        "button",
        {
          class: "item",
          type: "button",
          role: "menuitem",
          tabindex: -1,
          onclick: () => {
            this.closeMenu();
            action();
          },
        },
        icon(glyph),
        h("span", {}, label),
        ...extra,
      );
    this.ticketCount = h("span", { class: "count" });
    this.items = {
      fresh: item(t.startNew, "compose", () => this.reset()),
      end: item(t.endChat, "end", () => this.confirmEnd()),
      ...(this.handoffOn ? { human: item(t.human, "headset", () => this.showHandoff()) } : {}),
      tickets: item(t.viewTickets, "ticket", () => this.showTickets(), this.ticketCount),
    };
    this.menu = h("div", { class: "menu", id: "apex-menu", role: "menu", tabindex: -1, "aria-label": t.more }, ...Object.values(this.items));
    this.menu.addEventListener("keydown", (e) => this.menuKeys(e));
    this.menuBtn = h(
      "button",
      {
        class: "icon",
        type: "button",
        "aria-label": t.more,
        title: t.more,
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": "apex-menu",
        onclick: () => (this.menu.classList.contains("on") ? this.closeMenu() : this.openMenu(0)),
        onkeydown: ((e: KeyboardEvent) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          this.openMenu(e.key === "ArrowDown" ? 0 : -1);
        }) as EventListener,
      },
      icon("more"),
    );
    this.menuWrap = h("div", { class: "mw" }, this.menuBtn, this.menu);

    this.head = h(
      "div",
      { class: "head" },
      avatar,
      h("strong", { class: "title" }, cfg.botName),
      this.menuWrap,
      h("button", { class: "icon", type: "button", "aria-label": t.close, title: t.close, onclick: () => this.close(true) }, icon("close")),
    );

    this.panel = h("section", { class: "panel", id: "apex-panel", role: "dialog", "aria-label": `${cfg.botName}, ${t.ai}`, hidden: true }, this.head, this.chatView);
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close(true);
    });

    this.launcher = h("button", { class: "launcher", type: "button", "aria-label": t.open, "aria-expanded": "false", "aria-controls": "apex-panel", onclick: () => this.toggle() });
    this.paintLauncher();

    this.root = h("div", { class: "root", "data-pos": position === "bottom-left" ? "left" : "right", lang: this.lang, "data-float": ui?.behavior.mobileFullscreen === false }, this.panel, this.launcher);
    // a press anywhere in the widget outside the menu closes it (presses on the page: see outside())
    this.root.addEventListener("pointerdown", (e) => {
      if (!e.composedPath().includes(this.menuWrap)) this.closeMenu();
    });
    const style = this.root.style;
    style.setProperty("--p", primary);
    const onP = readableOn(primary);
    style.setProperty("--on-p", onP);
    // hover and tile shade on the brand-colored header
    style.setProperty("--p-tint", onP === "#ffffff" ? "rgba(255,255,255,.16)" : "rgba(12,12,9,.08)");
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
    const teaser = this.teaser;
    this.teaser = null;
    this.flag("teaser", true);
    if (!teaser) return;
    teaser.classList.add("out");
    setTimeout(() => teaser.remove(), still() ? 0 : 180);
  }

  /** Once-per-visit markers (teaser dismissed, auto-open done, lead form handled); `lasting` ones survive the visit. */
  private flag(name: string, set?: boolean, lasting?: boolean): boolean {
    const key = `${this.storageKey}:${name}`;
    try {
      const store = lasting ? localStorage : sessionStorage;
      if (set) store.setItem(key, "1");
      return !!store.getItem(key);
    } catch {
      return !!set;
    }
  }

  mount(): void {
    this.host.id = "apex-bot";
    const shadow = this.host.attachShadow({ mode: "closed" });
    // A constructed stylesheet is exempt from `style-src`, so strict-CSP hosts don't need 'unsafe-inline'.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
      shadow.append(this.root);
    } catch {
      shadow.append(h("style", {}, css), this.root);
    }
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
    clearTimeout(this.hideTimer);
    this.panel.hidden = false;
    // the closed state has to be laid out once, or the opening transition has nothing to start from
    void this.panel.offsetWidth;
    this.root.toggleAttribute("data-open", true);
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", this.t.close);
    this.paintLauncher();
    this.flag("auto", true);
    if (this.teaser) this.hideTeaser();
    this.ready ??= this.hydrate();
    if (this.view === this.chatView) this.input.focus();
    this.emit("open");
  }

  close(returnFocus = false): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.closeMenu();
    this.stopListening(true);
    this.hush();
    this.root.toggleAttribute("data-open", false);
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", this.t.open);
    this.paintLauncher();
    // out of the layout (and the accessibility tree) once the closing transition has played
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (!this.isOpen) this.panel.hidden = true;
    }, still() ? 0 : CLOSE_MS);
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

  /** Sends what is in the composer: its text and the files picked for it. */
  private async submit(): Promise<void> {
    // a file still being read would otherwise be left behind
    if (this.busy || this.files.some((f) => !f.prepared)) return;
    const files = this.files.map((f) => f.prepared!);
    if (!this.input.value.trim() && !files.length) return;
    this.stopListening(true);
    this.clearFiles();
    await this.send(this.input.value, files);
  }

  async send(raw: string, files: Prepared[] = [], speak = false): Promise<void> {
    const text = String(raw ?? "").trim();
    if ((!text && !files.length) || this.busy || this.outOfService) return;
    this.open();
    if (this.ended) this.reset();
    await this.ready;
    if (this.leadPending()) return;
    if (this.view !== this.chatView) this.backToChat();
    this.busy = true;
    this.input.value = "";
    this.autogrow();
    this.suggest.replaceChildren();
    this.hideNotice(false);

    const userBubble = this.addUser(text, true, files);
    const bubble = this.addBot("", true);
    bubble.append(h("div", { class: "typing", role: "status", "aria-label": this.t.typing }, h("i"), h("i"), h("i")));
    this.scroll(true, true);
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
            this.addMeta(bubble, event.messageId, event.sources, event.handoff, undefined, true);
            finished = true;
            if (speak) this.say(answer);
            else if (this.ui?.behavior.soundOnReply && (document.hidden || !this.isOpen)) chime();
            this.emit("message", { text: answer, sources: event.sources });
          } else if (event.type === "error") failure = event.code;
        },
        controller.signal,
        files.map((f) => f.attachment),
      );
      if (!finished) throw new ApiError(failure ?? "network");
    } catch (error) {
      cancelAnimationFrame(frame);
      if (controller.signal.aborted) return;
      this.showError(bubble, error instanceof ApiError ? error.code : "generic", () => {
        userBubble.remove();
        bubble.nextElementSibling?.classList.contains("meta") && bubble.nextElementSibling.remove();
        bubble.remove();
        void this.send(text, files, speak);
      }, text);
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
    // Tenants configured in the API's JSON file may only have some languages
    this.addBot(this.opts.greeting ?? (this.cfg.greeting[this.lang] || this.cfg.greeting[this.cfg.defaultLang] || this.cfg.greeting.en));
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
    this.scroll(true);
    const h = this.ui?.handoff;
    if (h?.leadCapture === "before-chat" && history.length === 0 && !this.flag("lead")) this.showLead();
  }

  private renderSuggestions(): void {
    const list = this.opts.suggestions ?? this.cfg.suggestions[this.lang] ?? [];
    this.suggest.replaceChildren(
      ...list.slice(0, 4).map((s) => h("button", { class: "chip", type: "button", onclick: () => void this.send(s) }, s)),
    );
  }

  /** Stops a reply that is still streaming; its bubble stays as far as it got. */
  private abort(): void {
    this.stopListening(true);
    this.hush();
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
    this.log.removeAttribute("aria-busy");
  }

  /** "Start a new chat": forgets the conversation and greets again. */
  private reset(): void {
    this.abort();
    this.ended = false;
    this.save(null);
    this.clearFiles();
    this.log.replaceChildren();
    this.suggest.replaceChildren();
    this.backToChat();
    this.ready = this.hydrate();
    this.updateSend();
    this.input.focus();
    this.emit("reset");
  }

  private hasChat(): boolean {
    return !!this.conversationId || !!this.log.querySelector(".user");
  }

  // ----- "more options" menu -----

  private enabledItems(): HTMLButtonElement[] {
    return Object.values(this.items).filter((b): b is HTMLButtonElement => !!b && !b.disabled && !b.hidden);
  }

  /** Opens the menu with focus on the item at `index` (negative counts from the end). */
  private openMenu(index: number): void {
    const { fresh, end, human, tickets } = this.items;
    // a required contact form can't be skipped from here either
    const locked = this.leadPending();
    fresh.disabled = locked;
    if (human) human.disabled = locked;
    end.disabled = locked || this.ended || !this.hasChat();
    tickets.disabled = locked;
    tickets.hidden = !this.handoffOn && !this.tickets.length;
    this.ticketCount.textContent = this.tickets.length ? String(this.tickets.length) : "";
    this.menu.classList.add("on");
    this.menuBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", this.outside, true);
    const items = this.enabledItems();
    (items[index < 0 ? items.length + index : index] ?? this.menu).focus();
  }

  private closeMenu(returnFocus = false): void {
    if (!this.menu.classList.contains("on")) return;
    this.menu.classList.remove("on");
    this.menuBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.outside, true);
    if (returnFocus) this.menuBtn.focus();
  }

  /** Presses on the host page; inside the closed shadow root they all target the host element. */
  private outside = (e: Event) => {
    if (e.target !== this.host) this.closeMenu();
  };

  private menuKeys(e: KeyboardEvent): void {
    const items = this.enabledItems();
    const at = items.indexOf(e.target as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = at <= 0 ? items.length - 1 : at - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") this.closeMenu();
    else if (e.key === "Escape") {
      // only the menu closes, not the whole panel
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu(true);
    }
    if (next >= 0 && items[next]) {
      e.preventDefault();
      items[next].focus();
    }
  }

  // ----- views -----

  /** Swaps what the panel shows under the header, with a short fade. */
  private show(next: HTMLElement): void {
    if (this.view === next) return;
    this.view.replaceWith(next);
    this.view = next;
    enter(next, { opacity: 0, transform: "translateY(6px)" });
  }

  /** "End chat" asks first, in a sheet over the panel. */
  private confirmEnd(): void {
    const t = this.t;
    const ok = h("button", { class: "btn danger", type: "button" }, t.endConfirm);
    const cancel = h("button", { class: "btn ghost", type: "button" }, t.cancel);
    const sheet = h(
      "div",
      { class: "sheet" },
      h(
        "div",
        { class: "card", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "apex-end-t", "aria-describedby": "apex-end-d" },
        h("h2", { id: "apex-end-t" }, t.endTitle),
        h("p", { id: "apex-end-d" }, t.endIntro),
        h("div", { class: "row" }, ok, cancel),
      ),
    );
    // the rest of the panel can't be reached while the question is open
    const behind = [this.head, this.view];
    let settled = false;
    const dismiss = (then: () => void) => {
      if (settled) return;
      settled = true;
      for (const el of behind) el.removeAttribute("inert");
      // the sheet fades out over the panel but takes no more input
      sheet.setAttribute("inert", "");
      sheet.classList.add("out");
      setTimeout(() => sheet.remove(), still() ? 0 : 180);
      then();
    };
    ok.addEventListener("click", () => dismiss(() => this.endChat()));
    cancel.addEventListener("click", () => dismiss(() => this.menuBtn.focus()));
    sheet.addEventListener("pointerdown", (e) => {
      if (e.target === sheet) cancel.click();
    });
    sheet.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancel.click();
      } else if (e.key === "Tab") {
        e.preventDefault();
        (e.target === ok ? cancel : ok).focus();
      }
    });
    for (const el of behind) el.setAttribute("inert", "");
    this.panel.append(sheet);
    // the safe choice has focus, so a stray Enter doesn't end the chat
    cancel.focus();
  }

  private endChat(): void {
    const t = this.t;
    const id = this.conversationId;
    this.abort();
    this.ended = true;
    this.save(null);
    this.clearFiles();
    this.log.replaceChildren();
    this.suggest.replaceChildren();

    const status = h("p", { class: "note", role: "status" });
    const fresh = h("button", { class: "btn primary", type: "button", onclick: () => this.reset() }, t.startNew);
    const kids: Kid[] = [
      h("div", { class: "badge" }, icon("check")),
      h("h2", {}, t.ended),
      h("p", { class: "note" }, t.endedIntro),
      h("div", { class: "row" }, fresh, h("button", { class: "btn ghost", type: "button", onclick: () => this.close(true) }, t.closeShort)),
    ];
    if (id) {
      // KVKK/GDPR: the visitor can also erase what was said
      const erase: HTMLButtonElement = h(
        "button",
        {
          class: "link",
          type: "button",
          onclick: async () => {
            erase.disabled = true;
            try {
              await this.api.deleteConversation(id);
            } catch (err) {
              const code = err instanceof ApiError ? err.code : "generic";
              // already gone (expired, or erased elsewhere) is what was asked for
              if (code !== "not_found") {
                erase.disabled = false;
                status.textContent = t.errors[code as keyof Strings["errors"]] ?? t.errors.generic;
                return;
              }
            }
            erase.remove();
            status.textContent = t.deleted;
            this.emit("delete", { conversationId: id });
          },
        },
        t.deleteChat,
      );
      kids.push(erase);
    }
    kids.push(status);
    this.show(h("div", { class: "pane end" }, ...kids));
    fresh.focus();
    this.emit("end", { conversationId: id });
  }

  /** The hand-off requests sent from this browser, newest first. */
  private showTickets(): void {
    const t = this.t;
    const from = this.view.classList.contains("tks") ? (this.ticketsFrom ?? this.chatView) : this.view;
    this.ticketsFrom = from;
    const back = h(
      "button",
      {
        class: "icon",
        type: "button",
        "aria-label": t.goBack,
        title: t.goBack,
        onclick: () => {
          if (from === this.chatView) return this.backToChat();
          this.show(from);
          from.querySelector<HTMLElement>("button,input,textarea")?.focus();
        },
      },
      icon("back"),
    );
    const date = (iso: string) => {
      try {
        return new Intl.DateTimeFormat(this.lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
      } catch {
        return iso.slice(0, 16).replace("T", " ");
      }
    };
    const list = this.tickets.length
      ? h(
          "ul",
          { class: "tickets" },
          ...this.tickets.map((k, i) => {
            const li = h(
              "li",
              { class: "ticket" },
              h("div", { class: "tt" }, h("strong", {}, `#${k.id}`), h("span", { class: "pill" }, t.ticketSent)),
              h("p", { class: k.note ? undefined : "muted" }, k.note || t.noNote),
              h("p", { class: "tm" }, h("time", { datetime: k.createdAt }, date(k.createdAt)), ` · ${t.replyTo}: ${k.email}`),
            );
            // CSSOM, not a style attribute, so strict-CSP hosts allow it
            li.style.animationDelay = `${Math.min(i, 6) * 40}ms`;
            return li;
          }),
        )
      : h(
          "div",
          { class: "empty" },
          icon("ticket"),
          h("p", {}, t.noTickets),
          this.handoffOn && h("button", { class: "btn primary", type: "button", onclick: () => this.showHandoff() }, t.human),
        );
    this.show(h("div", { class: "pane tks" }, h("div", { class: "ph" }, back, h("h2", {}, t.tickets)), !!this.tickets.length && h("p", { class: "note" }, t.ticketsIntro), list));
    back.focus();
  }

  private addTicket(ticket: StoredTicket): void {
    this.tickets = [ticket, ...this.tickets.filter((x) => x.id !== ticket.id)].slice(0, MAX_TICKETS);
    try {
      this.storage?.setItem(this.ticketsKey, JSON.stringify(this.tickets));
    } catch {
      // storage blocked; the list lasts for this page view
    }
  }

  private loadTickets(): StoredTicket[] {
    try {
      const raw: unknown = JSON.parse(this.storage?.getItem(this.ticketsKey) ?? "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(isTicket)
        .slice(0, MAX_TICKETS)
        .map(({ id, createdAt, email, note }) => ({ id, createdAt, email, note }));
    } catch {
      return [];
    }
  }

  /** A visitor message; files show as thumbnails (live) or by the names the transcript kept. */
  private addUser(text: string, live = false, files: Prepared[] = []): HTMLDivElement {
    const el = h("div", { class: live ? "msg user in" : "msg user" });
    const kept = files.length ? [] : [...text.matchAll(/^📎 (.+)$/gm)].map((m) => m[1]);
    const body = kept.length ? text.replace(/\n*^📎 .+$/gm, "").trim() : text;
    const pill = (name: string) => h("span", { class: "upfile" }, icon("file"), name);
    const shown = files.map(({ attachment: f, preview }) => {
      if (!preview) return pill(f.name);
      const img = h("img", { class: "upimg", src: preview, alt: f.name });
      // a host page's CSP may block data: images; the name still says what was sent
      img.addEventListener("error", () => img.replaceWith(pill(f.name)), { once: true });
      return img;
    });
    if (shown.length || kept.length) el.append(h("div", { class: "ups" }, ...shown, ...kept.map(pill)));
    if (body) el.append(body);
    this.log.append(el);
    return el;
  }

  // ----- files -----

  private pickFiles(): void {
    if (this.outOfService) return;
    if (!this.fileInput) {
      const input = (this.fileInput = h("input", { type: "file", multiple: true, accept: ACCEPT, hidden: true, tabindex: -1 }));
      input.addEventListener("change", () => {
        this.addFiles([...(input.files ?? [])]);
        input.value = "";
      });
      this.dock.append(input);
    }
    this.fileInput.click();
  }

  private addFiles(list: File[]): void {
    const t = this.t;
    for (const file of list) {
      if (this.files.length >= MAX_FILES) {
        this.composeFail("tooManyFiles");
        break;
      }
      const thumb = h("span", { class: "fthumb" }, icon("file"));
      const chip = h("div", { class: "fchip busy", title: file.name }, thumb, h("span", { class: "fname" }, file.name));
      const entry: (typeof this.files)[number] = { prepared: null, chip };
      chip.append(h("button", { class: "x", type: "button", "aria-label": `${t.removeFile}: ${file.name}`, onclick: () => this.removeFile(entry) }, icon("close")));
      this.files.push(entry);
      this.fileList.append(chip);
      prepareFile(file).then(
        (prepared) => {
          entry.prepared = prepared;
          chip.classList.remove("busy");
          if (prepared.preview) thumb.replaceChildren(h("img", { src: prepared.preview, alt: "" }));
          this.updateSend();
        },
        (error) => {
          this.removeFile(entry);
          this.composeFail(error instanceof FileError ? error.problem : "fileRead");
        },
      );
    }
    this.updateSend();
    this.input.focus();
  }

  private removeFile(entry: (typeof this.files)[number]): void {
    this.files = this.files.filter((f) => f !== entry);
    entry.chip.remove();
    this.updateSend();
  }

  private clearFiles(): void {
    this.files = [];
    this.fileList.replaceChildren();
    this.updateSend();
  }

  /** A short problem under the composer (unreadable file, microphone denied...). */
  private composeFail(problem: FileProblem | "tooManyFiles" | "micDenied"): void {
    this.composeError.textContent = this.t[problem];
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => (this.composeError.textContent = ""), 5000);
  }

  private hideNotice(refocus = true): void {
    const notice = this.notice;
    this.notice = null;
    // once seen and dismissed (or the visitor chatted on) it never comes back
    this.flag("notice", true, true);
    if (!notice) return;
    notice.classList.add("gone");
    this.dock.classList.add("bare");
    setTimeout(() => notice.remove(), still() ? 0 : 260);
    if (refocus) this.input.focus();
  }

  // ----- voice -----

  /** The round button: send, start or stop voice chat, or stop a reply being read aloud. */
  private primaryAction(): void {
    if (this.sendMode === "stop") this.hush();
    else if (this.sendMode === "voice") {
      if (this.voiceListening) this.stopListening();
      else this.listen(true);
    } else void this.submit();
  }

  /** The microphone: dictation into the text field, until pressed again. */
  private dictate(): void {
    if (this.rec) this.stopListening();
    else this.listen(false);
  }

  private listen(voiceMode: boolean): void {
    if (!this.voice || this.rec) return;
    this.hush();
    const rec = new this.voice();
    rec.lang = LOCALES[this.lang];
    rec.interimResults = true;
    // voice chat sends after one utterance; dictation keeps going until stopped
    rec.continuous = !voiceMode;
    const before = this.input.value.trim();
    let heard = "";
    rec.addEventListener("result", (e) => {
      const { resultIndex, results } = e as RecognitionResultEvent;
      let interim = "";
      for (let i = resultIndex; i < results.length; i++) {
        if (results[i].isFinal) heard += results[i][0].transcript;
        else interim += results[i][0].transcript;
      }
      this.input.value = [before, `${heard}${interim}`.trim()].filter(Boolean).join(" ");
      this.autogrow();
    });
    rec.addEventListener("error", (e) => {
      const code = (e as Event & { error?: string }).error;
      if (code === "not-allowed" || code === "service-not-allowed") this.composeFail("micDenied");
    });
    rec.addEventListener("end", () => {
      if (this.rec !== rec) return;
      this.rec = null;
      this.setListening(false);
      if (voiceMode && heard.trim()) void this.send(this.input.value, [], true);
    });
    this.rec = rec;
    this.setListening(true, voiceMode);
    try {
      rec.start();
    } catch {
      this.rec = null;
      this.setListening(false);
    }
  }

  /** Stops listening; `drop` discards whatever is still being recognised. */
  private stopListening(drop = false): void {
    const rec = this.rec;
    if (!rec) return;
    if (drop) {
      this.rec = null;
      rec.abort();
      this.setListening(false);
    } else rec.stop();
  }

  private setListening(on: boolean, voiceMode = false): void {
    const t = this.t;
    this.voiceListening = on && voiceMode;
    this.root.classList.toggle("rec", on);
    if (this.micBtn) {
      this.micBtn.setAttribute("aria-pressed", String(on && !voiceMode));
      this.micBtn.setAttribute("aria-label", on && !voiceMode ? t.stopDictate : t.dictate);
      this.micBtn.title = this.micBtn.getAttribute("aria-label")!;
    }
    this.input.placeholder = on ? t.listening : t.placeholder;
    this.updateSend();
  }

  /** Reads a reply aloud (voice chat), with the browser's own speech synthesis. */
  private say(markdown: string): void {
    const synth = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
    const text = speakable(markdown);
    if (!synth || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LOCALES[this.lang];
    utterance.onend = utterance.onerror = () => {
      this.speaking = false;
      this.updateSend();
    };
    synth.cancel();
    this.speaking = true;
    this.updateSend();
    synth.speak(utterance);
  }

  private hush(): void {
    if (!this.speaking) return;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.speaking = false;
    this.updateSend();
  }

  private addBot(markdown: string, live = false): HTMLDivElement {
    const el = h("div", { class: live ? "msg bot in" : "msg bot" });
    el.append(renderMarkdown(markdown));
    this.log.append(el);
    return el;
  }

  private addMeta(after: HTMLElement, messageId: string, sources: Source[], handoff: boolean, feedback?: "up" | "down", live = false): void {
    const t = this.t;
    const meta = h("div", { class: live ? "meta in" : "meta" });
    const show = this.ui?.behavior;
    if (show?.showSources === false) sources = [];
    if (sources.length) {
      meta.append(
        h(
          "div",
          { class: "sources" },
          h("span", {}, `${t.sources}:`),
          ...sources.map((s) => {
            const href = webUrl(s.url);
            return href
              ? h("a", { class: "chip", href, target: "_blank", rel: "noopener noreferrer", title: href }, s.title)
              : h("span", { class: "chip" }, s.title);
          }),
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

  /** `question`: what the visitor asked, carried into the hand-off form when that opens in its place. */
  private showError(bubble: HTMLDivElement, code: string, retry: () => void, question = ""): void {
    const t = this.t;
    bubble.className = "msg bot error";
    // the site's monthly replies are used up: the team answers instead (visitors are never told why)
    const quota = code === "quota_exhausted";
    const message = quota && !this.handoffOn ? t.errors.out_of_service : (t.errors[code as keyof Strings["errors"]] ?? t.errors.generic);
    bubble.replaceChildren(h("p", {}, message));
    if (code === "out_of_service") return this.stopService();
    let action: HTMLButtonElement | null = null;
    if (quota && this.handoffOn) {
      const open = () => this.showHandoff({ reason: t.errors.quota_exhausted, note: question });
      action = h("button", { class: "chip", type: "button", onclick: open }, t.human);
      bubble.after(h("div", { class: "meta in" }, h("div", {}, action)));
      return open();
    }
    if ((code === "budget_exhausted" || code === "refused") && this.handoffOn) {
      action = h("button", { class: "chip", type: "button", onclick: () => this.showHandoff() }, t.human);
    } else if (code === "conversation_full") {
      action = h("button", { class: "chip", type: "button", onclick: () => this.reset() }, t.newChat);
    } else if (code === "network" || code === "generic" || code === "upstream" || code === "rate_limited") {
      action = h("button", { class: "chip", type: "button", onclick: retry }, t.retry);
    }
    if (action) bubble.after(h("div", { class: "meta in" }, h("div", {}, action)));
    this.scroll();
  }

  /** No retry and no hand-off: nothing on this site answers until staff turn it back on. */
  private stopService(): void {
    this.outOfService = true;
    this.stopListening(true);
    this.clearFiles();
    this.suggest.replaceChildren();
    this.input.value = "";
    this.input.disabled = true;
    this.input.placeholder = this.t.errors.out_of_service;
    this.updateSend();
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
        "data-lead": "1",
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
    this.show(form);
    email.focus();
  }

  /** `reason`: shown above the form when it opens in place of an answer; `note`: the message box's starting text. */
  private showHandoff(opening: { reason?: string; note?: string } = {}): void {
    const t = this.t;
    this.open();
    const email = h("input", { type: "email", required: true, autocomplete: "email", maxlength: 254, value: this.identity.email || undefined });
    const name = h("input", { type: "text", autocomplete: "name", maxlength: 100, value: this.identity.name || undefined });
    const note = h("textarea", { rows: 3, maxlength: 2000 });
    if (opening.note) note.value = opening.note.slice(0, 2000);
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
          const address = email.value.trim();
          if (!EMAIL.test(address)) {
            error.textContent = t.invalidEmail;
            email.setAttribute("aria-invalid", "true");
            email.focus();
            return;
          }
          email.removeAttribute("aria-invalid");
          error.textContent = "";
          submit.disabled = true;
          submit.textContent = t.sending;
          try {
            const ticket = await this.api.handoff({ conversationId: this.conversationId, email: address, name: name.value.trim(), message: note.value.trim() });
            this.identity = { name: name.value.trim(), email: address };
            if (ticket) this.addTicket({ ...ticket, email: address, note: note.value.trim().slice(0, 280) });
            const back = h("button", { class: "btn primary", type: "button", onclick: () => this.backToChat() }, t.back);
            form.replaceChildren(
              h("div", { class: "badge" }, icon("check")),
              h("h2", {}, t.handoffTitle),
              h("p", { role: "status" }, t.handoffSent),
              ticket ? h("p", { class: "ref" }, `${t.ticketNo} `, h("strong", {}, `#${ticket.id}`)) : "",
              h("div", { class: "row" }, back, ticket && h("button", { class: "btn ghost", type: "button", onclick: () => this.showTickets() }, t.viewTickets)),
            );
            enter(form, { opacity: 0, transform: "translateY(6px)" });
            back.focus();
            this.emit("handoff", ticket ? { ticket: ticket.id } : undefined);
          } catch (err) {
            const code = err instanceof ApiError ? err.code : "generic";
            error.textContent = t.errors[code as keyof Strings["errors"]] ?? t.errors.generic;
            submit.disabled = false;
            submit.textContent = t.submit;
          }
        },
      },
      h("h2", {}, t.handoffTitle),
      opening.reason ? h("p", { class: "reason", role: "status" }, opening.reason) : "",
      h("p", {}, t.handoffIntro),
      h("label", {}, t.email, email),
      h("label", {}, t.name, name),
      h("label", {}, t.note, note),
      error,
      h("div", { class: "row" }, submit, cancel),
    );
    this.show(form);
    email.focus();
  }

  /** A required lead form is still open: no route back to the chat skips it. */
  private leadPending(): boolean {
    const h = this.ui?.handoff;
    return h?.leadCapture === "before-chat" && h.leadRequired && !this.flag("lead") && this.view.dataset.lead === "1";
  }

  private backToChat(): void {
    if (this.leadPending()) return;
    this.show(this.chatView);
    this.input.focus();
    this.scroll(true);
  }

  private autogrow(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight + 2, 132)}px`;
    this.updateSend();
  }

  private updateSend(): void {
    const t = this.t;
    const hasInput = !!this.input.value.trim() || this.files.length > 0;
    const mode = this.speaking ? "stop" : this.voice && (this.voiceListening || (!hasInput && !this.busy)) ? "voice" : "send";
    this.sendBtn.disabled = this.outOfService || (mode === "send" && (this.busy || !hasInput || this.files.some((f) => !f.prepared)));
    this.sendBtn.classList.toggle("live", this.voiceListening);
    if (mode === this.sendMode) return;
    this.sendMode = mode;
    const label = mode === "stop" ? t.stopVoice : mode === "voice" ? t.voiceMode : t.send;
    this.sendBtn.setAttribute("aria-label", label);
    this.sendBtn.title = label;
    this.sendBtn.replaceChildren(icon(mode === "stop" ? "stop" : mode === "voice" ? "wave" : "send"));
  }

  private onScroll(): void {
    const { scrollTop, scrollHeight, clientHeight } = this.log;
    // near the bottom re-pins; only moving up unpins, so a smooth scroll down never does
    if (scrollHeight - scrollTop - clientHeight < 40) this.pinned = true;
    else if (scrollTop < this.lastTop - 2) this.pinned = false;
    this.lastTop = scrollTop;
    this.jump.classList.toggle("on", !this.pinned);
  }

  /** Keeps the newest message in view, unless the visitor scrolled up to read (`force` overrides). */
  private scroll(force = false, smooth = false): void {
    if (force) this.pinned = true;
    if (!this.pinned) return;
    const top = this.log.scrollHeight;
    if (smooth && !still() && typeof this.log.scrollTo === "function") this.log.scrollTo({ top, behavior: "smooth" });
    else this.log.scrollTop = top;
    this.jump.classList.remove("on");
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
