// Chatbot settings: the model catalog, the settings shape, defaults and validation.
// Pure TypeScript with no Node or pg imports, so the dashboard (browser), the web
// server and the chat API all share one definition (import "@apex/db/bot-settings").

export type Lang = "tr" | "en"
export const LANGS: readonly Lang[] = ["tr", "en"]
export type Localized = Record<Lang, string>

// ---------- Models ----------

export type Provider = "anthropic" | "openai" | "google"
export type Reasoning = "low" | "medium" | "high"

export interface ModelInfo {
  id: string
  provider: Provider
  label: string
  tier: "flagship" | "balanced" | "fast"
  description: string
  /** Context window, for display. */
  context?: string
  /** USD per million tokens, where the provider's published rate is known. */
  price?: { input: number; output: number }
  /** Accepts a custom temperature (most reasoning models reject one). */
  temperature: boolean
  /** Accepts a reasoning-depth setting. */
  reasoning: boolean
  preview?: boolean
  recommended?: boolean
}

export const PROVIDERS: { id: Provider; label: string; envKey: string }[] = [
  { id: "anthropic", label: "Anthropic", envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", envKey: "OPENAI_API_KEY" },
  { id: "google", label: "Google", envKey: "GEMINI_API_KEY" },
]

// Current lineups from each provider's model docs (October 2026). Deprecated and
// shut-down models are left out; anything not listed here is rejected on save.
export const MODELS: ModelInfo[] = [
  // Anthropic: the 5.x models fix sampling, so depth is set with effort instead of temperature
  { id: "claude-fable-5-1", provider: "anthropic", label: "Claude Fable 5.1", tier: "flagship", description: "Most capable Claude model, for the hardest questions. Slower and the most expensive.", context: "1M", price: { input: 10, output: 50 }, temperature: false, reasoning: true },
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", tier: "flagship", description: "Top-tier reasoning and writing for complex support and sales conversations.", context: "1M", price: { input: 4, output: 20 }, temperature: false, reasoning: true },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", tier: "balanced", description: "Fast and capable. A strong default for most websites.", context: "1M", price: { input: 2, output: 10 }, temperature: false, reasoning: true, recommended: true },
  { id: "claude-haiku-5-5", provider: "anthropic", label: "Claude Haiku 5.5", tier: "fast", description: "Fastest and cheapest Claude model, for high-volume FAQ answering.", context: "1M", price: { input: 0.1, output: 0.5 }, temperature: false, reasoning: true },
  { id: "claude-sonnet-4-6", provider: "anthropic", label: "Claude Sonnet 4.6", tier: "balanced", description: "Previous-generation Sonnet. Supports a custom temperature.", context: "1M", price: { input: 3, output: 15 }, temperature: true, reasoning: true },
  { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", tier: "fast", description: "Previous-generation Haiku. Supports a custom temperature.", context: "200K", price: { input: 1, output: 5 }, temperature: true, reasoning: false },

  // OpenAI
  { id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", tier: "flagship", description: "OpenAI's most capable model, for the hardest tasks.", temperature: false, reasoning: true },
  { id: "gpt-6.1-sol", provider: "openai", label: "GPT-6.1 Sol", tier: "flagship", description: "Near-Astra quality at a lower cost.", temperature: false, reasoning: true },
  { id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna", tier: "fast", description: "Most efficient GPT-6 model, for focused, high-volume work.", temperature: false, reasoning: true, recommended: true },
  { id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", tier: "flagship", description: "GPT-5.6 flagship for complex professional work.", temperature: false, reasoning: true },
  { id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", tier: "balanced", description: "GPT-5.6, balancing quality and cost.", temperature: false, reasoning: true },
  { id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna", tier: "fast", description: "GPT-5.6 tuned for cost-sensitive workloads.", temperature: false, reasoning: true },
  { id: "gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini", tier: "fast", description: "Small, fast and inexpensive.", temperature: false, reasoning: true },
  { id: "gpt-4.1", provider: "openai", label: "GPT-4.1", tier: "balanced", description: "Strongest non-reasoning model. Supports a custom temperature.", temperature: true, reasoning: false },
  { id: "gpt-4.1-mini", provider: "openai", label: "GPT-4.1 mini", tier: "fast", description: "Smaller, faster GPT-4.1. Supports a custom temperature.", temperature: true, reasoning: false },

  // Google
  { id: "gemini-3.8-flash", provider: "google", label: "Gemini 3.8 Flash", tier: "balanced", description: "Google's most capable Flash model. Fast, multilingual and production-ready.", temperature: true, reasoning: true, recommended: true },
  { id: "gemini-3.1-pro-preview", provider: "google", label: "Gemini 3.1 Pro", tier: "flagship", description: "Advanced reasoning for complex questions.", temperature: true, reasoning: true, preview: true },
  { id: "gemini-3.6-flash", provider: "google", label: "Gemini 3.6 Flash", tier: "balanced", description: "Previous-generation Flash with balanced speed and quality.", temperature: true, reasoning: true },
  { id: "gemini-3-flash-preview", provider: "google", label: "Gemini 3 Flash", tier: "balanced", description: "Frontier-class quality at a fraction of the cost.", temperature: true, reasoning: true, preview: true },
  { id: "gemini-3.5-flash-lite", provider: "google", label: "Gemini 3.5 Flash-Lite", tier: "fast", description: "Fastest and cheapest Gemini, for high-throughput work.", temperature: true, reasoning: true },
  { id: "gemini-3.1-flash-lite", provider: "google", label: "Gemini 3.1 Flash-Lite", tier: "fast", description: "Near-frontier answers at a much lower cost.", temperature: true, reasoning: true },
]

export function findModel(provider: string, id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.provider === provider && m.id === id)
}

/** Highest temperature each provider accepts. */
export const MAX_TEMPERATURE: Record<Provider, number> = { anthropic: 1, openai: 2, google: 2 }

// ---------- Settings ----------

export type Tone = "formal" | "friendly" | "concise" | "detailed"
export type LauncherIcon = "chat" | "sparkle" | "help" | "headset" | "custom"

export interface BotSettings {
  general: {
    botName: string
    /** Shown in the widget header and used by the assistant to name the business. */
    companyName: string
    defaultLang: Lang
    /** "auto": follow the visitor's browser language; "fixed": always defaultLang. */
    languageMode: "auto" | "fixed"
    /** Line under the bot name in the header; empty uses "AI assistant · company". */
    subtitle: Localized
  }
  appearance: {
    theme: "auto" | "light" | "dark"
    primaryColor: string
    position: "bottom-right" | "bottom-left"
    /** Distance from the screen edges, in px. */
    offsetX: number
    offsetY: number
    launcherIcon: LauncherIcon
    /** For launcherIcon "custom": an https URL or an uploaded image as a data: URL. */
    launcherImage: string
    /** Text next to the launcher icon; empty shows a round icon-only button. */
    launcherLabel: Localized
    launcherSize: "small" | "medium" | "large"
    avatar: "initial" | "icon" | "image"
    avatarUrl: string
    /** Panel corner radius, in px. */
    radius: number
    font: "system" | "rounded" | "serif" | "mono"
    panelWidth: "compact" | "standard" | "wide"
    showBranding: boolean
  }
  messages: {
    greeting: Localized
    suggestions: Record<Lang, string[]>
    placeholder: Localized
    /** What the assistant says when the knowledge base has no answer. */
    unknownAnswer: Localized
    showDisclaimer: boolean
    disclaimer: Localized
    privacyUrl: string
  }
  behavior: {
    autoOpen: "never" | "delay"
    /** Seconds before the panel opens on its own. */
    autoOpenDelay: number
    autoOpenOnMobile: boolean
    /** Bubble shown above the closed launcher; empty for none. */
    teaser: Localized
    showSources: boolean
    showFeedback: boolean
    soundOnReply: boolean
    /** Where the conversation survives: this tab, this browser, or nowhere. */
    persistence: "tab" | "browser" | "none"
    mobileFullscreen: boolean
    /** Path prefixes where the widget stays hidden, e.g. "/checkout". */
    hiddenPaths: string[]
  }
  model: {
    provider: Provider
    id: string
    temperature: number
    maxOutputTokens: number
    reasoning: Reasoning
    /** Earlier messages sent with each turn. */
    historyMessages: number
    fallback: { enabled: boolean; provider: Provider; id: string }
  }
  persona: {
    tone: Tone
    responseLength: "short" | "balanced" | "detailed"
    useEmoji: boolean
    /** Extra instructions appended to the system prompt. */
    instructions: string
    blockedTopics: string[]
    /** How closely a page must match before it counts as an answer. */
    confidence: "strict" | "balanced" | "lenient"
  }
  handoff: {
    enabled: boolean
    email: string
    /** Offer "Talk to a human" when the assistant can't answer. */
    offerWhenUnsure: boolean
    /** "before-chat": ask for contact details before the first message. */
    leadCapture: "off" | "before-chat"
    leadFields: { name: boolean; phone: boolean }
    leadRequired: boolean
  }
  security: {
    allowedOrigins: string[]
    maxMessageChars: number
    messagesPerMinute: number
    dailyTokenBudget: number
    retentionDays: number
  }
}

export const LIMITS = {
  botName: 40,
  companyName: 80,
  subtitle: 80,
  launcherLabel: 24,
  greeting: 500,
  suggestion: 80,
  suggestions: 4,
  placeholder: 80,
  unknownAnswer: 400,
  disclaimer: 200,
  teaser: 120,
  instructions: 4000,
  blockedTopic: 120,
  blockedTopics: 20,
  hiddenPaths: 20,
  origins: 20,
  url: 500,
  /** Characters of a data: URL, about 90 KB of image. */
  launcherImage: 120_000,
  offset: { min: 0, max: 120 },
  radius: { min: 0, max: 28 },
  autoOpenDelay: { min: 1, max: 120 },
  maxOutputTokens: { min: 256, max: 16000 },
  historyMessages: { min: 0, max: 30 },
  maxMessageChars: { min: 200, max: 4000 },
  messagesPerMinute: { min: 1, max: 120 },
  dailyTokenBudget: { min: 10_000, max: 100_000_000 },
  retentionDays: { min: 1, max: 365 },
} as const

export const DEFAULT_SETTINGS: BotSettings = {
  general: {
    botName: "Apex",
    companyName: "",
    defaultLang: "en",
    languageMode: "auto",
    subtitle: { tr: "", en: "" },
  },
  appearance: {
    theme: "auto",
    primaryColor: "#0c0c09",
    position: "bottom-right",
    offsetX: 20,
    offsetY: 20,
    launcherIcon: "chat",
    launcherImage: "",
    launcherLabel: { tr: "", en: "" },
    launcherSize: "medium",
    avatar: "initial",
    avatarUrl: "",
    radius: 16,
    font: "system",
    panelWidth: "standard",
    showBranding: true,
  },
  messages: {
    greeting: {
      tr: "Merhaba! Size nasıl yardımcı olabilirim?",
      en: "Hi there! How can I help you today?",
    },
    suggestions: { tr: [], en: [] },
    placeholder: { tr: "Bir soru yazın…", en: "Ask a question…" },
    unknownAnswer: {
      tr: "Bu konuda bir bilgim yok. İsterseniz sizi ekibimize yönlendirebilirim.",
      en: "I don't have information on that yet. I can connect you with our team if you like.",
    },
    showDisclaimer: true,
    disclaimer: {
      tr: "Yanıtlar yapay zekâ ile üretilir ve hatalı olabilir.",
      en: "Answers are AI-generated and may be inaccurate.",
    },
    privacyUrl: "",
  },
  behavior: {
    autoOpen: "never",
    autoOpenDelay: 10,
    autoOpenOnMobile: false,
    teaser: { tr: "", en: "" },
    showSources: true,
    showFeedback: true,
    soundOnReply: false,
    persistence: "tab",
    mobileFullscreen: true,
    hiddenPaths: [],
  },
  model: {
    provider: "anthropic",
    id: "claude-sonnet-5-5",
    temperature: 0.4,
    maxOutputTokens: 1024,
    reasoning: "low",
    historyMessages: 8,
    fallback: { enabled: false, provider: "google", id: "gemini-3.8-flash" },
  },
  persona: {
    tone: "friendly",
    responseLength: "balanced",
    useEmoji: false,
    instructions: "",
    blockedTopics: [],
    confidence: "balanced",
  },
  handoff: {
    enabled: true,
    email: "",
    offerWhenUnsure: true,
    leadCapture: "off",
    leadFields: { name: true, phone: false },
    leadRequired: false,
  },
  security: {
    allowedOrigins: [],
    maxMessageChars: 1000,
    messagesPerMinute: 15,
    dailyTokenBudget: 2_000_000,
    retentionDays: 30,
  },
}

// ---------- Validation ----------

export interface SettingsIssue {
  /** Dotted path, e.g. "messages.greeting.tr". */
  path: string
  message: string
}

export class BotSettingsError extends Error {
  constructor(readonly issues: SettingsIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("; "))
  }
}

// No SVG: an uploaded SVG could carry script if it were ever rendered outside an <img>
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)

/**
 * Validates and normalizes untrusted settings (an API body, a stored row). Missing
 * fields take their default, so rows saved before a field existed still load; wrong
 * types and out-of-range values are reported, never silently coerced.
 */
export function parseSettings(raw: unknown): BotSettings {
  const issues: SettingsIssue[] = []
  const root = isObj(raw) ? raw : {}
  if (raw !== undefined && !isObj(raw)) issues.push({ path: "", message: "Settings must be an object" })

  const section = (name: keyof BotSettings): Obj => {
    const v = root[name]
    if (v === undefined) return {}
    if (!isObj(v)) {
      issues.push({ path: name, message: "Must be an object" })
      return {}
    }
    return v
  }

  const r = {
    str(o: Obj, path: string, key: string, fallback: string, max: number, opts: { required?: boolean } = {}): string {
      const v = o[key]
      const at = `${path}.${key}`
      if (v === undefined) return fallback
      if (typeof v !== "string") return fail(at, "Must be text", fallback)
      const s = v.trim()
      if (opts.required && !s) return fail(at, "Required", fallback)
      if (s.length > max) return fail(at, `Keep it under ${max} characters`, fallback)
      return s
    },
    bool(o: Obj, path: string, key: string, fallback: boolean): boolean {
      const v = o[key]
      if (v === undefined) return fallback
      return typeof v === "boolean" ? v : fail(`${path}.${key}`, "Must be on or off", fallback)
    },
    num(o: Obj, path: string, key: string, fallback: number, range: { min: number; max: number }, integer = true): number {
      const v = o[key]
      const at = `${path}.${key}`
      if (v === undefined) return fallback
      if (typeof v !== "number" || !Number.isFinite(v)) return fail(at, "Must be a number", fallback)
      if (integer && !Number.isInteger(v)) return fail(at, "Must be a whole number", fallback)
      if (v < range.min || v > range.max) return fail(at, `Must be between ${range.min} and ${range.max}`, fallback)
      return v
    },
    oneOf<T extends string>(o: Obj, path: string, key: string, fallback: T, allowed: readonly T[]): T {
      const v = o[key]
      if (v === undefined) return fallback
      return allowed.includes(v as T) ? (v as T) : fail(`${path}.${key}`, `Must be one of: ${allowed.join(", ")}`, fallback)
    },
    localized(o: Obj, path: string, key: string, fallback: Localized, max: number, opts: { required?: boolean } = {}): Localized {
      const v = o[key]
      const at = `${path}.${key}`
      if (v === undefined) return { ...fallback }
      if (!isObj(v)) return fail(at, "Must have a Turkish and an English version", { ...fallback })
      return { tr: r.str(v, at, "tr", fallback.tr, max, opts), en: r.str(v, at, "en", fallback.en, max, opts) }
    },
    list(o: Obj, path: string, key: string, fallback: string[], maxItems: number, maxLen: number, check?: (s: string) => string | null): string[] {
      const v = o[key]
      const at = `${path}.${key}`
      if (v === undefined) return [...fallback]
      if (!Array.isArray(v)) return fail(at, "Must be a list", [...fallback])
      const out: string[] = []
      v.forEach((item, i) => {
        if (typeof item !== "string") return issues.push({ path: `${at}.${i}`, message: "Must be text" })
        const s = item.trim()
        if (!s) return
        if (s.length > maxLen) return issues.push({ path: `${at}.${i}`, message: `Keep it under ${maxLen} characters` })
        const problem = check?.(s)
        if (problem) return issues.push({ path: `${at}.${i}`, message: problem })
        if (!out.includes(s)) out.push(s)
      })
      if (out.length > maxItems) issues.push({ path: at, message: `At most ${maxItems} items` })
      return out.slice(0, maxItems)
    },
  }
  function fail<T>(path: string, message: string, fallback: T): T {
    issues.push({ path, message })
    return fallback
  }

  const D = DEFAULT_SETTINGS

  const g = section("general")
  const general: BotSettings["general"] = {
    botName: r.str(g, "general", "botName", D.general.botName, LIMITS.botName, { required: true }),
    companyName: r.str(g, "general", "companyName", D.general.companyName, LIMITS.companyName),
    defaultLang: r.oneOf(g, "general", "defaultLang", D.general.defaultLang, LANGS),
    languageMode: r.oneOf(g, "general", "languageMode", D.general.languageMode, ["auto", "fixed"] as const),
    subtitle: r.localized(g, "general", "subtitle", D.general.subtitle, LIMITS.subtitle),
  }

  const a = section("appearance")
  const appearance: BotSettings["appearance"] = {
    theme: r.oneOf(a, "appearance", "theme", D.appearance.theme, ["auto", "light", "dark"] as const),
    primaryColor: r.str(a, "appearance", "primaryColor", D.appearance.primaryColor, 7),
    position: r.oneOf(a, "appearance", "position", D.appearance.position, ["bottom-right", "bottom-left"] as const),
    offsetX: r.num(a, "appearance", "offsetX", D.appearance.offsetX, LIMITS.offset),
    offsetY: r.num(a, "appearance", "offsetY", D.appearance.offsetY, LIMITS.offset),
    launcherIcon: r.oneOf(a, "appearance", "launcherIcon", D.appearance.launcherIcon, ["chat", "sparkle", "help", "headset", "custom"] as const),
    launcherImage: r.str(a, "appearance", "launcherImage", D.appearance.launcherImage, LIMITS.launcherImage),
    launcherLabel: r.localized(a, "appearance", "launcherLabel", D.appearance.launcherLabel, LIMITS.launcherLabel),
    launcherSize: r.oneOf(a, "appearance", "launcherSize", D.appearance.launcherSize, ["small", "medium", "large"] as const),
    avatar: r.oneOf(a, "appearance", "avatar", D.appearance.avatar, ["initial", "icon", "image"] as const),
    avatarUrl: r.str(a, "appearance", "avatarUrl", D.appearance.avatarUrl, LIMITS.url),
    radius: r.num(a, "appearance", "radius", D.appearance.radius, LIMITS.radius),
    font: r.oneOf(a, "appearance", "font", D.appearance.font, ["system", "rounded", "serif", "mono"] as const),
    panelWidth: r.oneOf(a, "appearance", "panelWidth", D.appearance.panelWidth, ["compact", "standard", "wide"] as const),
    showBranding: r.bool(a, "appearance", "showBranding", D.appearance.showBranding),
  }
  if (!HEX.test(appearance.primaryColor)) {
    issues.push({ path: "appearance.primaryColor", message: "Use a hex color like #1f6feb" })
    appearance.primaryColor = D.appearance.primaryColor
  }
  if (appearance.avatarUrl && !isHttpsUrl(appearance.avatarUrl)) {
    issues.push({ path: "appearance.avatarUrl", message: "Use an https:// image URL" })
    appearance.avatarUrl = ""
  }
  if (appearance.launcherImage && !isHttpsUrl(appearance.launcherImage) && !IMAGE_DATA_URL.test(appearance.launcherImage)) {
    issues.push({ path: "appearance.launcherImage", message: "Upload a PNG, JPEG, WebP or GIF, or use an https:// image URL" })
    appearance.launcherImage = ""
  }
  if (appearance.launcherIcon === "custom" && !appearance.launcherImage) {
    issues.push({ path: "appearance.launcherImage", message: "Upload an image or pick one of the icons" })
  }
  if (appearance.avatar === "image" && !appearance.avatarUrl) {
    issues.push({ path: "appearance.avatarUrl", message: "Add an image URL or pick another avatar style" })
  }

  const m = section("messages")
  const suggestionsRaw = isObj(m.suggestions) ? m.suggestions : {}
  if (m.suggestions !== undefined && !isObj(m.suggestions)) issues.push({ path: "messages.suggestions", message: "Must have a Turkish and an English list" })
  const messages: BotSettings["messages"] = {
    greeting: r.localized(m, "messages", "greeting", D.messages.greeting, LIMITS.greeting, { required: true }),
    suggestions: {
      tr: r.list(suggestionsRaw, "messages.suggestions", "tr", D.messages.suggestions.tr, LIMITS.suggestions, LIMITS.suggestion),
      en: r.list(suggestionsRaw, "messages.suggestions", "en", D.messages.suggestions.en, LIMITS.suggestions, LIMITS.suggestion),
    },
    placeholder: r.localized(m, "messages", "placeholder", D.messages.placeholder, LIMITS.placeholder, { required: true }),
    unknownAnswer: r.localized(m, "messages", "unknownAnswer", D.messages.unknownAnswer, LIMITS.unknownAnswer, { required: true }),
    showDisclaimer: r.bool(m, "messages", "showDisclaimer", D.messages.showDisclaimer),
    disclaimer: r.localized(m, "messages", "disclaimer", D.messages.disclaimer, LIMITS.disclaimer),
    privacyUrl: r.str(m, "messages", "privacyUrl", D.messages.privacyUrl, LIMITS.url),
  }
  if (messages.privacyUrl && !isHttpUrl(messages.privacyUrl)) {
    issues.push({ path: "messages.privacyUrl", message: "Use a full URL starting with https://" })
    messages.privacyUrl = ""
  }

  const b = section("behavior")
  const behavior: BotSettings["behavior"] = {
    autoOpen: r.oneOf(b, "behavior", "autoOpen", D.behavior.autoOpen, ["never", "delay"] as const),
    autoOpenDelay: r.num(b, "behavior", "autoOpenDelay", D.behavior.autoOpenDelay, LIMITS.autoOpenDelay),
    autoOpenOnMobile: r.bool(b, "behavior", "autoOpenOnMobile", D.behavior.autoOpenOnMobile),
    teaser: r.localized(b, "behavior", "teaser", D.behavior.teaser, LIMITS.teaser),
    showSources: r.bool(b, "behavior", "showSources", D.behavior.showSources),
    showFeedback: r.bool(b, "behavior", "showFeedback", D.behavior.showFeedback),
    soundOnReply: r.bool(b, "behavior", "soundOnReply", D.behavior.soundOnReply),
    persistence: r.oneOf(b, "behavior", "persistence", D.behavior.persistence, ["tab", "browser", "none"] as const),
    mobileFullscreen: r.bool(b, "behavior", "mobileFullscreen", D.behavior.mobileFullscreen),
    hiddenPaths: r.list(b, "behavior", "hiddenPaths", D.behavior.hiddenPaths, LIMITS.hiddenPaths, 200, (s) =>
      s.startsWith("/") ? null : 'Start paths with "/", e.g. /checkout',
    ),
  }

  const mo = section("model")
  const fb = isObj(mo.fallback) ? mo.fallback : {}
  if (mo.fallback !== undefined && !isObj(mo.fallback)) issues.push({ path: "model.fallback", message: "Must be an object" })
  const providers = PROVIDERS.map((p) => p.id)
  const model: BotSettings["model"] = {
    provider: r.oneOf(mo, "model", "provider", D.model.provider, providers),
    id: r.str(mo, "model", "id", D.model.id, 100, { required: true }),
    temperature: r.num(mo, "model", "temperature", D.model.temperature, { min: 0, max: 2 }, false),
    maxOutputTokens: r.num(mo, "model", "maxOutputTokens", D.model.maxOutputTokens, LIMITS.maxOutputTokens),
    reasoning: r.oneOf(mo, "model", "reasoning", D.model.reasoning, ["low", "medium", "high"] as const),
    historyMessages: r.num(mo, "model", "historyMessages", D.model.historyMessages, LIMITS.historyMessages),
    fallback: {
      enabled: r.bool(fb, "model.fallback", "enabled", D.model.fallback.enabled),
      provider: r.oneOf(fb, "model.fallback", "provider", D.model.fallback.provider, providers),
      id: r.str(fb, "model.fallback", "id", D.model.fallback.id, 100),
    },
  }
  if (!findModel(model.provider, model.id)) {
    issues.push({ path: "model.id", message: "Pick a model from the list" })
  }
  if (model.temperature > MAX_TEMPERATURE[model.provider]) {
    issues.push({ path: "model.temperature", message: `This provider accepts at most ${MAX_TEMPERATURE[model.provider]}` })
  }
  if (model.fallback.enabled) {
    if (!findModel(model.fallback.provider, model.fallback.id)) {
      issues.push({ path: "model.fallback.id", message: "Pick a fallback model from the list" })
    } else if (model.fallback.provider === model.provider && model.fallback.id === model.id) {
      issues.push({ path: "model.fallback.id", message: "Pick a different model than the primary one" })
    }
  }

  const p = section("persona")
  const persona: BotSettings["persona"] = {
    tone: r.oneOf(p, "persona", "tone", D.persona.tone, ["formal", "friendly", "concise", "detailed"] as const),
    responseLength: r.oneOf(p, "persona", "responseLength", D.persona.responseLength, ["short", "balanced", "detailed"] as const),
    useEmoji: r.bool(p, "persona", "useEmoji", D.persona.useEmoji),
    instructions: r.str(p, "persona", "instructions", D.persona.instructions, LIMITS.instructions),
    blockedTopics: r.list(p, "persona", "blockedTopics", D.persona.blockedTopics, LIMITS.blockedTopics, LIMITS.blockedTopic),
    confidence: r.oneOf(p, "persona", "confidence", D.persona.confidence, ["strict", "balanced", "lenient"] as const),
  }

  const h = section("handoff")
  const lf = isObj(h.leadFields) ? h.leadFields : {}
  const handoff: BotSettings["handoff"] = {
    enabled: r.bool(h, "handoff", "enabled", D.handoff.enabled),
    email: r.str(h, "handoff", "email", D.handoff.email, 254).toLowerCase(),
    offerWhenUnsure: r.bool(h, "handoff", "offerWhenUnsure", D.handoff.offerWhenUnsure),
    leadCapture: r.oneOf(h, "handoff", "leadCapture", D.handoff.leadCapture, ["off", "before-chat"] as const),
    leadFields: {
      name: r.bool(lf, "handoff.leadFields", "name", D.handoff.leadFields.name),
      phone: r.bool(lf, "handoff.leadFields", "phone", D.handoff.leadFields.phone),
    },
    leadRequired: r.bool(h, "handoff", "leadRequired", D.handoff.leadRequired),
  }
  if (handoff.email && !EMAIL.test(handoff.email)) {
    issues.push({ path: "handoff.email", message: "Enter a valid email address" })
  } else if (handoff.enabled && !handoff.email) {
    issues.push({ path: "handoff.email", message: "Add the address that receives hand-offs, or turn hand-off off" })
  }

  const s = section("security")
  const security: BotSettings["security"] = {
    allowedOrigins: r.list(s, "security", "allowedOrigins", D.security.allowedOrigins, LIMITS.origins, LIMITS.url, (o) =>
      normalizeOrigin(o) ? null : "Use a site address like https://example.com",
    ).map((o) => normalizeOrigin(o) ?? o),
    maxMessageChars: r.num(s, "security", "maxMessageChars", D.security.maxMessageChars, LIMITS.maxMessageChars),
    messagesPerMinute: r.num(s, "security", "messagesPerMinute", D.security.messagesPerMinute, LIMITS.messagesPerMinute),
    dailyTokenBudget: r.num(s, "security", "dailyTokenBudget", D.security.dailyTokenBudget, LIMITS.dailyTokenBudget),
    retentionDays: r.num(s, "security", "retentionDays", D.security.retentionDays, LIMITS.retentionDays),
  }
  security.allowedOrigins = [...new Set(security.allowedOrigins)]

  if (issues.length) throw new BotSettingsError(issues)
  return { general, appearance, messages, behavior, model, persona, handoff, security }
}

/** Like parseSettings, but returns the issues instead of throwing (for live form feedback). */
export function checkSettings(raw: unknown): SettingsIssue[] {
  try {
    parseSettings(raw)
    return []
  } catch (err) {
    if (err instanceof BotSettingsError) return err.issues
    throw err
  }
}

/**
 * Loads stored settings that may no longer validate (a model left the catalog, a
 * limit tightened): each offending field falls back to its default, then its whole
 * section if that still fails, so one stale value never locks the owner out.
 */
export function repairSettings(raw: unknown): BotSettings {
  let doc: unknown = isObj(raw) ? structuredClone(raw) : {}
  const dropped = new Set<string>()
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return parseSettings(doc)
    } catch (err) {
      if (!(err instanceof BotSettingsError)) throw err
      for (const { path } of err.issues) {
        // a field that still fails at its default is reset with its whole section
        const target = dropped.has(path) ? path.split(".")[0] : path
        dropped.add(path)
        doc = without(doc as Obj, target.split("."))
      }
    }
  }
  return structuredClone(DEFAULT_SETTINGS)
}

function without(doc: Obj, keys: string[]): Obj {
  if (keys.length === 0 || keys[0] === "") return {}
  const [head, ...rest] = keys
  if (!(head in doc)) return doc
  const copy = { ...doc }
  if (rest.length === 0) delete copy[head]
  else if (isObj(copy[head])) copy[head] = without(copy[head] as Obj, rest)
  else if (Array.isArray(copy[head])) copy[head] = (copy[head] as unknown[]).filter((_, i) => String(i) !== rest[0])
  else delete copy[head]
  return copy
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

/** The part of the settings the public widget may see: no handoff address, limits or prompt. */
export function publicWidgetSettings(settings: BotSettings) {
  const { general, appearance, messages, behavior, handoff } = settings
  return {
    general,
    appearance,
    messages: {
      greeting: messages.greeting,
      suggestions: messages.suggestions,
      placeholder: messages.placeholder,
      showDisclaimer: messages.showDisclaimer,
      disclaimer: messages.disclaimer,
      privacyUrl: messages.privacyUrl,
    },
    behavior,
    handoff: {
      enabled: handoff.enabled && !!handoff.email,
      leadCapture: handoff.leadCapture,
      leadFields: handoff.leadFields,
      leadRequired: handoff.leadRequired,
    },
  }
}
export type PublicWidgetSettings = ReturnType<typeof publicWidgetSettings>

// ---------- Presentation constants (shared by the dashboard preview; the widget mirrors them) ----------

export const FONT_STACKS: Record<BotSettings["appearance"]["font"], string> = {
  system: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  rounded: 'ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Quicksand,Nunito,system-ui,sans-serif',
  serif: 'ui-serif,Georgia,Cambria,"Times New Roman",Times,serif',
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
}
export const PANEL_WIDTHS: Record<BotSettings["appearance"]["panelWidth"], number> = { compact: 340, standard: 384, wide: 440 }
export const LAUNCHER_SIZES: Record<BotSettings["appearance"]["launcherSize"], number> = { small: 48, medium: 56, large: 64 }

/** Black or white, whichever reads better on the given hex background. */
export function readableOn(hex: string): string {
  const full = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0c0c09" : "#ffffff"
}
