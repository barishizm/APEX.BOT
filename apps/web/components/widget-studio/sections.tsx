"use client"

import { AlignLeft, AlignRight, Check, Copy, ImageIcon, KeyRound, TriangleAlert } from "lucide-react"
import { useState, type ReactNode } from "react"
import {
  FONT_STACKS,
  LIMITS,
  MAX_TEMPERATURE,
  MODELS,
  PROVIDERS,
  findModel,
  type BotSettings,
  type Lang,
  type Localized,
  type ModelInfo,
  type Provider,
} from "@apex/db/bot-settings"
import { cn } from "@/lib/utils"
import {
  ChoiceCards,
  ColorField,
  Field,
  Group,
  ImageField,
  ListEditor,
  NumberInput,
  Segmented,
  Select,
  Slider,
  TextArea,
  TextInput,
  Toggle,
} from "./fields"
import { LAUNCHER_ICONS } from "./preview"

export type SetSection = <K extends keyof BotSettings>(section: K, patch: Partial<BotSettings[K]>) => void

export interface SectionProps {
  s: BotSettings
  set: SetSection
  lang: Lang
  /** The validation message for a settings path, if any. */
  err: (path: string) => string | undefined
  /** Item-index → message map for list fields, "" for the list itself. */
  listErr: (path: string) => Record<string, string> | undefined
}

const LANG_NAME: Record<Lang, string> = { tr: "Turkish", en: "English" }
const other = (lang: Lang): Lang => (lang === "tr" ? "en" : "tr")

function LangTag({ lang }: { lang: Lang }) {
  return (
    <span className="ml-1.5 rounded bg-[var(--color-bubble)] px-1.5 py-px align-middle text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
      {lang}
    </span>
  )
}

/** Hint under a translated field when the other language still needs text. */
function missingHint(value: Localized, lang: Lang, hint?: ReactNode): ReactNode {
  const o = other(lang)
  if (value[lang].trim() && !value[o].trim()) return `${LANG_NAME[o]} version is empty. Switch the editing language above to fill it in.`
  return hint
}

function LocalizedInput({
  label,
  value,
  lang,
  onChange,
  max,
  error,
  hint,
  placeholder,
  multiline,
}: {
  label: string
  value: Localized
  lang: Lang
  onChange: (v: Localized) => void
  max: number
  error?: string
  hint?: ReactNode
  placeholder?: string
  multiline?: boolean
}) {
  const props = {
    label: (
      <>
        {label}
        <LangTag lang={lang} />
      </>
    ),
    value: value[lang],
    onChange: (v: string) => onChange({ ...value, [lang]: v }),
    max,
    error,
    placeholder,
    hint: missingHint(value, lang, hint),
  }
  return multiline ? <TextArea {...props} rows={3} /> : <TextInput {...props} />
}

const grid2 = "grid gap-5 sm:grid-cols-2"

// ---------- General ----------

export function GeneralSection({ s, set, lang, err }: SectionProps) {
  const g = s.general
  return (
    <>
      <Group title="Identity" description="How the assistant introduces itself to visitors.">
        <div className={grid2}>
          <TextInput label="Bot name" value={g.botName} onChange={(botName) => set("general", { botName })} max={LIMITS.botName} error={err("general.botName")} placeholder="Apex" />
          <TextInput
            label="Company name"
            value={g.companyName}
            onChange={(companyName) => set("general", { companyName })}
            max={LIMITS.companyName}
            error={err("general.companyName")}
            placeholder="Crest Cycles"
            hint="Used in the header and when the assistant refers to your business."
          />
        </div>
        <LocalizedInput
          label="Header subtitle"
          value={g.subtitle}
          lang={lang}
          onChange={(subtitle) => set("general", { subtitle })}
          max={LIMITS.subtitle}
          error={err(`general.subtitle.${lang}`)}
          placeholder={lang === "tr" ? "Genelde birkaç saniyede yanıtlar" : "Usually replies in seconds"}
          hint="Leave empty to show “AI assistant · company name”."
        />
      </Group>
      <Group title="Language" description="The widget speaks Turkish and English. The assistant replies in the visitor's language.">
        <Segmented
          label="Default language"
          value={g.defaultLang}
          onChange={(defaultLang) => set("general", { defaultLang })}
          options={[
            { value: "tr", label: "Türkçe" },
            { value: "en", label: "English" },
          ]}
          hint="Used for the interface and for hand-off emails when the visitor's language can't be detected."
        />
        <ChoiceCards
          label="Interface language"
          value={g.languageMode}
          onChange={(languageMode) => set("general", { languageMode })}
          options={[
            { value: "auto", title: "Follow the visitor", description: "Uses the browser's language when it's Turkish or English, otherwise the default." },
            { value: "fixed", title: "Always the default", description: "Every visitor sees the default language, whatever their browser says." },
          ]}
        />
      </Group>
    </>
  )
}

// ---------- Appearance ----------

export function AppearanceSection({ s, set, lang, err }: SectionProps) {
  const a = s.appearance
  return (
    <>
      <Group title="Colors and theme">
        <ColorField
          label="Brand color"
          value={a.primaryColor}
          onChange={(primaryColor) => set("appearance", { primaryColor })}
          error={err("appearance.primaryColor")}
          hint="Used for the launcher, your visitors' messages and buttons. Text on it switches between black and white for contrast."
        />
        <Segmented
          label="Theme"
          value={a.theme}
          onChange={(theme) => set("appearance", { theme })}
          options={[
            { value: "auto", label: "Match visitor's device" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Group>

      <Group title="Launcher" description="The button visitors click to open the chat.">
        <ChoiceCards
          label="Icon"
          columns={5}
          value={a.launcherIcon}
          onChange={(launcherIcon) => set("appearance", { launcherIcon })}
          options={[
            ...(Object.keys(LAUNCHER_ICONS) as (keyof typeof LAUNCHER_ICONS)[]).map((key) => {
              const Icon = LAUNCHER_ICONS[key]
              return { value: key, title: { chat: "Chat", sparkle: "Sparkle", help: "Help", headset: "Support" }[key], icon: <Icon className="h-4 w-4" aria-hidden /> }
            }),
            { value: "custom" as const, title: "Your image", icon: <ImageIcon className="h-4 w-4" aria-hidden /> },
          ]}
        />
        {a.launcherIcon === "custom" && (
          <ImageField
            label="Launcher image"
            value={a.launcherImage}
            onChange={(launcherImage) => set("appearance", { launcherImage })}
            error={err("appearance.launcherImage")}
            background={a.primaryColor}
            hint="Drop a PNG, JPEG, WebP or GIF here. You can crop, rotate and position it after uploading. A transparent logo or mascot on your brand color works best."
          />
        )}
        <div className={grid2}>
          <LocalizedInput
            label="Button label"
            value={a.launcherLabel}
            lang={lang}
            onChange={(launcherLabel) => set("appearance", { launcherLabel })}
            max={LIMITS.launcherLabel}
            error={err(`appearance.launcherLabel.${lang}`)}
            placeholder={lang === "tr" ? "Bize sorun" : "Ask us"}
            hint="Leave empty for a round, icon-only button."
          />
          <Segmented
            label="Size"
            value={a.launcherSize}
            onChange={(launcherSize) => set("appearance", { launcherSize })}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
        </div>
        <Segmented
          label="Position"
          value={a.position}
          onChange={(position) => set("appearance", { position })}
          options={[
            { value: "bottom-left", label: <><AlignLeft className="h-4 w-4" aria-hidden /> Bottom left</> },
            { value: "bottom-right", label: <><AlignRight className="h-4 w-4" aria-hidden /> Bottom right</> },
          ]}
        />
        <div className={grid2}>
          <Slider label="Side spacing" value={a.offsetX} onChange={(offsetX) => set("appearance", { offsetX })} min={LIMITS.offset.min} max={LIMITS.offset.max} unit="px" error={err("appearance.offsetX")} />
          <Slider
            label="Bottom spacing"
            value={a.offsetY}
            onChange={(offsetY) => set("appearance", { offsetY })}
            min={LIMITS.offset.min}
            max={LIMITS.offset.max}
            unit="px"
            error={err("appearance.offsetY")}
            hint="Raise it if the launcher covers a cookie banner or another floating button."
          />
        </div>
      </Group>

      <Group title="Chat window">
        <div className={grid2}>
          <Segmented
            label="Avatar"
            value={a.avatar}
            onChange={(avatar) => set("appearance", { avatar })}
            options={[
              { value: "initial", label: "Initial" },
              { value: "icon", label: "Bot icon" },
              { value: "image", label: "Image" },
            ]}
          />
          <Segmented
            label="Width"
            value={a.panelWidth}
            onChange={(panelWidth) => set("appearance", { panelWidth })}
            options={[
              { value: "compact", label: "Compact" },
              { value: "standard", label: "Standard" },
              { value: "wide", label: "Wide" },
            ]}
          />
        </div>
        {a.avatar === "image" && (
          <TextInput
            label="Avatar image URL"
            type="url"
            value={a.avatarUrl}
            onChange={(avatarUrl) => set("appearance", { avatarUrl })}
            error={err("appearance.avatarUrl")}
            placeholder="https://example.com/logo.png"
            hint="A square image over https, at least 64×64 px."
            mono
          />
        )}
        <Slider label="Corner radius" value={a.radius} onChange={(radius) => set("appearance", { radius })} min={LIMITS.radius.min} max={LIMITS.radius.max} unit="px" error={err("appearance.radius")} />
        <ChoiceCards
          label="Font"
          columns={4}
          value={a.font}
          onChange={(font) => set("appearance", { font })}
          options={(["system", "rounded", "serif", "mono"] as const).map((f) => ({
            value: f,
            title: <span style={{ fontFamily: FONT_STACKS[f] }}>{{ system: "System", rounded: "Rounded", serif: "Serif", mono: "Mono" }[f]}</span>,
            description: <span style={{ fontFamily: FONT_STACKS[f] }}>Aa Ğğ Şş 123</span>,
          }))}
        />
        <Toggle
          label="Show “Powered by Apex Bot”"
          description="A small line under the message box."
          checked={a.showBranding}
          onChange={(showBranding) => set("appearance", { showBranding })}
        />
      </Group>
    </>
  )
}

// ---------- Messages ----------

export function MessagesSection({ s, set, lang, err, listErr }: SectionProps) {
  const m = s.messages
  return (
    <>
      <Group title="Welcome" description="The first thing visitors see when they open the chat.">
        <LocalizedInput label="Greeting" multiline value={m.greeting} lang={lang} onChange={(greeting) => set("messages", { greeting })} max={LIMITS.greeting} error={err(`messages.greeting.${lang}`)} />
        <ListEditor
          label={
            <>
              Suggested questions
              <LangTag lang={lang} />
            </>
          }
          items={m.suggestions[lang]}
          onChange={(list) => set("messages", { suggestions: { ...m.suggestions, [lang]: list } })}
          max={LIMITS.suggestions}
          maxLength={LIMITS.suggestion}
          placeholder={lang === "tr" ? "Kargo ne kadar sürer?" : "How long does shipping take?"}
          hint="One-tap questions shown under the greeting until the visitor sends a message."
          errors={listErr(`messages.suggestions.${lang}`)}
        />
        <LocalizedInput label="Message box placeholder" value={m.placeholder} lang={lang} onChange={(placeholder) => set("messages", { placeholder })} max={LIMITS.placeholder} error={err(`messages.placeholder.${lang}`)} />
      </Group>
      <Group title="When there's no answer">
        <LocalizedInput
          label="“I don't know” reply"
          multiline
          value={m.unknownAnswer}
          lang={lang}
          onChange={(unknownAnswer) => set("messages", { unknownAnswer })}
          max={LIMITS.unknownAnswer}
          error={err(`messages.unknownAnswer.${lang}`)}
          hint="The assistant says this, in its own words, when your knowledge base doesn't cover the question. It never guesses."
        />
      </Group>
      <Group title="Footer">
        <Toggle label="AI disclaimer" description="Tells visitors the answers come from AI. Recommended, and required in some regions." checked={m.showDisclaimer} onChange={(showDisclaimer) => set("messages", { showDisclaimer })} />
        {m.showDisclaimer && (
          <LocalizedInput label="Disclaimer text" value={m.disclaimer} lang={lang} onChange={(disclaimer) => set("messages", { disclaimer })} max={LIMITS.disclaimer} error={err(`messages.disclaimer.${lang}`)} />
        )}
        <TextInput
          label="Privacy policy URL"
          type="url"
          value={m.privacyUrl}
          onChange={(privacyUrl) => set("messages", { privacyUrl })}
          error={err("messages.privacyUrl")}
          placeholder="https://example.com/privacy"
          hint="Adds a “Privacy” link to the footer (KVKK / GDPR)."
          mono
        />
      </Group>
    </>
  )
}

// ---------- Behavior ----------

export function BehaviorSection({ s, set, lang, err, listErr }: SectionProps) {
  const b = s.behavior
  return (
    <>
      <Group title="Opening" description="Proactive prompts lift engagement, but use them sparingly.">
        <Segmented
          label="Open automatically"
          value={b.autoOpen}
          onChange={(autoOpen) => set("behavior", { autoOpen })}
          options={[
            { value: "never", label: "Never" },
            { value: "delay", label: "After a delay" },
          ]}
          hint="Opens once per visit, and never after the visitor closed the chat."
        />
        {b.autoOpen === "delay" && (
          <>
            <Slider label="Delay" value={b.autoOpenDelay} onChange={(autoOpenDelay) => set("behavior", { autoOpenDelay })} min={LIMITS.autoOpenDelay.min} max={LIMITS.autoOpenDelay.max} unit=" s" error={err("behavior.autoOpenDelay")} />
            <Toggle label="Also on phones" description="On small screens the chat covers the page, so this is off by default." checked={b.autoOpenOnMobile} onChange={(autoOpenOnMobile) => set("behavior", { autoOpenOnMobile })} />
          </>
        )}
        <LocalizedInput
          label="Teaser bubble"
          value={b.teaser}
          lang={lang}
          onChange={(teaser) => set("behavior", { teaser })}
          max={LIMITS.teaser}
          error={err(`behavior.teaser.${lang}`)}
          placeholder={lang === "tr" ? "Sorunuz mu var? Hemen yanıtlayalım 👋" : "Questions? We answer in seconds 👋"}
          hint="A short message above the closed launcher. Leave empty for none."
        />
      </Group>
      <Group title="In the conversation">
        <Toggle label="Show sources" description="Links to the pages each answer is based on. Builds trust and sends visitors to the right page." checked={b.showSources} onChange={(showSources) => set("behavior", { showSources })} />
        <Toggle label="Answer feedback" description="Thumbs up / down under each answer, so you can find weak answers later." checked={b.showFeedback} onChange={(showFeedback) => set("behavior", { showFeedback })} />
        <Toggle label="Sound on reply" description="A soft chime when an answer arrives while the visitor is in another tab." checked={b.soundOnReply} onChange={(soundOnReply) => set("behavior", { soundOnReply })} />
        <Toggle label="Full screen on phones" description="Recommended. Turn off to keep the floating window on small screens." checked={b.mobileFullscreen} onChange={(mobileFullscreen) => set("behavior", { mobileFullscreen })} />
        <ChoiceCards
          label="Remember the conversation"
          columns={3}
          value={b.persistence}
          onChange={(persistence) => set("behavior", { persistence })}
          options={[
            { value: "tab", title: "This tab", description: "Survives page changes, ends when the tab closes." },
            { value: "browser", title: "This browser", description: "Visitors pick up where they left off on their next visit." },
            { value: "none", title: "Don't remember", description: "Every page load starts a fresh conversation." },
          ]}
        />
      </Group>
      <Group title="Where it appears">
        <ListEditor
          label="Hide on these pages"
          items={b.hiddenPaths}
          onChange={(hiddenPaths) => set("behavior", { hiddenPaths })}
          max={LIMITS.hiddenPaths}
          maxLength={200}
          placeholder="/checkout"
          hint="Path prefixes. “/checkout” also hides it on /checkout/payment."
          errors={listErr("behavior.hiddenPaths")}
          mono
        />
      </Group>
    </>
  )
}

// ---------- Model ----------

const TIER: Record<ModelInfo["tier"], string> = { flagship: "Most capable", balanced: "Balanced", fast: "Fast & cheap" }

// Rough per-message token use: system prompt + retrieved excerpts + history in, a short answer out
const EST_INPUT_TOKENS = 3000
const EST_OUTPUT_TOKENS = 300

function estimate(model: ModelInfo, maxOutput: number): string | null {
  if (!model.price) return null
  const out = Math.min(EST_OUTPUT_TOKENS, maxOutput)
  const per1000 = ((EST_INPUT_TOKENS * model.price.input + out * model.price.output) / 1_000_000) * 1000
  return per1000 < 1 ? `≈ $${per1000.toFixed(2)}` : `≈ $${per1000.toFixed(per1000 < 10 ? 1 : 0)}`
}

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "warn" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-px text-[0.6875rem] font-semibold",
        tone === "accent" && "bg-[var(--color-secondary)] text-[var(--color-surface)]",
        tone === "warn" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        tone === "muted" && "bg-[var(--color-bubble)] text-[var(--color-muted)]",
      )}
    >
      {children}
    </span>
  )
}

export function ModelSection({ s, set, err }: SectionProps) {
  const mo = s.model
  const current = findModel(mo.provider, mo.id)
  const list = MODELS.filter((m) => m.provider === mo.provider)

  const pickProvider = (provider: Provider) => {
    if (provider === mo.provider) return
    const next = MODELS.find((m) => m.provider === provider && m.recommended) ?? MODELS.find((m) => m.provider === provider)!
    set("model", { provider, id: next.id, temperature: Math.min(mo.temperature, MAX_TEMPERATURE[provider]) })
  }

  return (
    <>
      <Group title="Provider" description="Choose whose model writes the answers. You can switch any time; conversations continue on the new model.">
        <div role="radiogroup" aria-label="Provider" className="grid gap-2 sm:grid-cols-3">
          {PROVIDERS.map((p) => {
            const on = p.id === mo.provider
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickProvider(p.id)}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-1 rounded-xl border bg-[var(--color-raised)] p-3 text-left transition-colors",
                  on ? "border-[var(--color-secondary)] ring-1 ring-[var(--color-secondary)]" : "border-[var(--color-line)] hover:border-[var(--color-muted)]/60",
                )}
              >
                <span className="flex w-full items-center justify-between text-sm font-semibold text-[var(--color-text)]">
                  {p.label}
                  {on && <Check className="h-4 w-4 text-[var(--color-secondary)]" aria-hidden />}
                </span>
                <span className="text-xs text-[var(--color-muted)]">{MODELS.filter((m) => m.provider === p.id).length} models</span>
              </button>
            )
          })}
        </div>
      </Group>

      <Group title="Model" description={err("model.id") ?? "Faster models answer in about a second; the most capable ones think longer before replying."}>
        <div role="radiogroup" aria-label="Model" className="flex flex-col gap-2">
          {list.map((m) => {
            const on = m.id === mo.id
            const cost = estimate(m, mo.maxOutputTokens)
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("model", { id: m.id })}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border bg-[var(--color-raised)] p-3.5 text-left transition-colors",
                  on ? "border-[var(--color-secondary)] ring-1 ring-[var(--color-secondary)]" : "border-[var(--color-line)] hover:border-[var(--color-muted)]/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                    on ? "border-[var(--color-secondary)]" : "border-[var(--color-line)]",
                  )}
                >
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-secondary)]" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
                    {m.label}
                    <Badge>{TIER[m.tier]}</Badge>
                    {m.recommended && <Badge tone="accent">Recommended</Badge>}
                    {m.preview && <Badge tone="warn">Preview</Badge>}
                  </span>
                  <span className="text-xs leading-relaxed text-[var(--color-muted)]">{m.description}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.6875rem] text-[var(--color-muted)]">
                    <span>{m.id}</span>
                    {m.context && <span>{m.context} context</span>}
                    {m.price && (
                      <span>
                        ${m.price.input} / ${m.price.output} per 1M tokens
                      </span>
                    )}
                    {cost && <span>{cost} per 1,000 messages</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {current?.preview && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
            Preview models can change or be retired at short notice. Turn on a fallback below if you use one in production.
          </p>
        )}
        <p className="text-xs leading-relaxed text-[var(--color-muted)]">
          The chat server needs a <code className="font-mono">{PROVIDERS.find((p) => p.id === mo.provider)!.envKey}</code> for this provider. Cost estimates assume about{" "}
          {EST_INPUT_TOKENS.toLocaleString("en")} input and {EST_OUTPUT_TOKENS} output tokens per message and exclude prompt-cache savings.
        </p>
      </Group>

      <Group title="Generation">
        <Slider
          label="Creativity (temperature)"
          value={current?.temperature ? mo.temperature : 0}
          onChange={(temperature) => set("model", { temperature })}
          min={0}
          max={MAX_TEMPERATURE[mo.provider]}
          step={0.1}
          format={(v) => v.toFixed(1)}
          disabled={!current?.temperature}
          error={err("model.temperature")}
          hint={
            current?.temperature
              ? "Lower is more consistent and literal; higher varies wording more. 0.2–0.5 suits customer support."
              : `${current?.label ?? "This model"} manages its own sampling. Use answer depth below instead.`
          }
        />
        <Segmented
          label="Answer depth (reasoning)"
          value={mo.reasoning}
          onChange={(reasoning) => set("model", { reasoning })}
          disabled={!current?.reasoning}
          options={[
            { value: "low", label: "Quick" },
            { value: "medium", label: "Balanced" },
            { value: "high", label: "Thorough" },
          ]}
          hint={
            current?.reasoning
              ? "How long the model thinks before answering. “Quick” keeps replies fast and cheap and is enough for most FAQ questions."
              : `${current?.label ?? "This model"} doesn't think before answering, so this setting doesn't apply.`
          }
        />
        <div className={grid2}>
          <Slider
            label="Max answer length"
            value={mo.maxOutputTokens}
            onChange={(maxOutputTokens) => set("model", { maxOutputTokens })}
            min={LIMITS.maxOutputTokens.min}
            max={LIMITS.maxOutputTokens.max}
            step={256}
            format={(v) => v.toLocaleString("en")}
            unit=" tok"
            error={err("model.maxOutputTokens")}
            hint="A hard ceiling, including the model's thinking. Answers are usually far shorter."
          />
          <Slider
            label="Conversation memory"
            value={mo.historyMessages}
            onChange={(historyMessages) => set("model", { historyMessages })}
            min={LIMITS.historyMessages.min}
            max={LIMITS.historyMessages.max}
            unit=" msgs"
            error={err("model.historyMessages")}
            hint="Earlier messages sent with each question. More context, more cost."
          />
        </div>
      </Group>

      <Group title="Fallback model" description="If the primary model errors, refuses or is overloaded, the turn is retried once on this model.">
        <Toggle label="Use a fallback" checked={mo.fallback.enabled} onChange={(enabled) => set("model", { fallback: { ...mo.fallback, enabled } })} />
        {mo.fallback.enabled && (
          <Select
            label="Fallback"
            value={`${mo.fallback.provider}:${mo.fallback.id}`}
            onChange={(v) => {
              const [provider, ...rest] = v.split(":")
              set("model", { fallback: { ...mo.fallback, provider: provider as Provider, id: rest.join(":") } })
            }}
            options={MODELS.filter((m) => !(m.provider === mo.provider && m.id === mo.id)).map((m) => ({
              value: `${m.provider}:${m.id}`,
              label: `${m.label}${m.preview ? " (preview)" : ""}`,
              group: PROVIDERS.find((p) => p.id === m.provider)!.label,
            }))}
            error={err("model.fallback.id")}
            hint="A model from another provider also covers a provider-wide outage."
          />
        )}
      </Group>
    </>
  )
}

// ---------- Persona ----------

export function PersonaSection({ s, set, err, listErr }: SectionProps) {
  const p = s.persona
  return (
    <>
      <Group title="Voice">
        <ChoiceCards
          label="Tone"
          value={p.tone}
          onChange={(tone) => set("persona", { tone })}
          options={[
            { value: "friendly", title: "Friendly", description: "Warm and approachable, still professional." },
            { value: "formal", title: "Formal", description: "Polite and reserved. Addresses visitors as “siz”." },
            { value: "concise", title: "Concise", description: "Straight to the point, no small talk." },
            { value: "detailed", title: "Detailed", description: "Walks through steps and specifics." },
          ]}
        />
        <Segmented
          label="Answer length"
          value={p.responseLength}
          onChange={(responseLength) => set("persona", { responseLength })}
          options={[
            { value: "short", label: "Short" },
            { value: "balanced", label: "Balanced" },
            { value: "detailed", label: "Detailed" },
          ]}
          hint="Short: one or two sentences. Balanced: two to five. Detailed: as long as the answer needs."
        />
        <Toggle label="Use emoji" description="An occasional emoji in friendly replies. Never in formal ones." checked={p.useEmoji} onChange={(useEmoji) => set("persona", { useEmoji })} />
      </Group>
      <Group title="Instructions" description="Your own rules, added to the assistant's instructions. Safety and grounding rules always come first.">
        <TextArea
          label="Custom instructions"
          rows={7}
          value={p.instructions}
          onChange={(instructions) => set("persona", { instructions })}
          max={LIMITS.instructions}
          error={err("persona.instructions")}
          placeholder={"- Recommend the Urban Pro when visitors ask about commuting.\n- Mention free shipping over $50 when it's relevant.\n- Always end order questions with a link to the order tracking page."}
          hint="Write rules as short bullet points. The assistant still only states facts from your knowledge base."
        />
        <ListEditor
          label="Topics to decline"
          items={p.blockedTopics}
          onChange={(blockedTopics) => set("persona", { blockedTopics })}
          max={LIMITS.blockedTopics}
          maxLength={LIMITS.blockedTopic}
          placeholder="Competitors' prices"
          hint="The assistant politely declines these and steers back to how it can help."
          errors={listErr("persona.blockedTopics")}
        />
      </Group>
      <Group title="Answer confidence" description="How closely your content must match a question before the assistant answers from it.">
        <ChoiceCards
          label="Match threshold"
          columns={3}
          value={p.confidence}
          onChange={(confidence) => set("persona", { confidence })}
          options={[
            { value: "strict", title: "Strict", description: "Answers only clear matches. Fewest wrong answers, more “I don't know”." },
            { value: "balanced", title: "Balanced", description: "Recommended for most sites." },
            { value: "lenient", title: "Lenient", description: "Tries more questions. Better for small knowledge bases." },
          ]}
        />
      </Group>
    </>
  )
}

// ---------- Hand-off ----------

/** What the handoff section needs to know about confirmation, beyond the settings themselves. */
export interface HandoffVerification {
  /** The address saved on the bot is confirmed. */
  savedVerified: boolean
  savedEmail: string
  /** Called with the new version once a code was accepted (confirming bumps the bot's version). */
  onConfirmed: (bot: { version: number; handoffVerified: boolean }) => void
}

const LINK_BUTTON =
  "inline-flex h-10 cursor-pointer items-center rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"

// Hand-offs are only mailed to an address its owner has proven they can read
function ConfirmAddress({ email, verification }: { email: string; verification: HandoffVerification }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const address = email.trim().toLowerCase()
  const verified = (verification.savedVerified && address === verification.savedEmail.toLowerCase()) || confirmed === address
  if (!address || verified) {
    return verified && address ? <p className="m-0 text-sm text-[var(--color-muted)]">Confirmed. Hand-offs will be sent to this address.</p> : null
  }

  const call = async (url: string, body: object) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setMessage(data.issues?.[0]?.message ?? data.message ?? "Something went wrong. Try again")
      return res.ok ? data : null
    } catch {
      setMessage("You're offline. Check your connection and try again")
      return null
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
      <p className="m-0 text-sm">This address isn&apos;t confirmed yet, so no hand-off emails are sent to it. We&apos;ll email a 6-digit code to it.</p>
      {sentTo === address ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="Confirmation code"
            placeholder="123456"
            className="h-10 w-32 rounded-lg border border-[var(--color-line)] bg-transparent px-3 font-mono text-sm"
          />
          <button
            type="button"
            disabled={busy || code.length !== 6}
            className={LINK_BUTTON}
            onClick={async () => {
              const data = await call("/api/bot/handoff-email/confirm", { code })
              if (data) {
                setConfirmed(address)
                setCode("")
                verification.onConfirmed({ version: data.version, handoffVerified: data.handoffVerified })
              }
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            className={LINK_BUTTON}
            onClick={async () => {
              if (await call("/api/bot/handoff-email", { email: address })) setMessage("Sent a new code")
            }}
          >
            Resend
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={busy}
            className={LINK_BUTTON}
            onClick={async () => {
              if (await call("/api/bot/handoff-email", { email: address })) {
                setSentTo(address)
                setMessage(`Code sent to ${address}. It expires in 15 minutes.`)
              }
            }}
          >
            Send confirmation code
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="m-0 text-sm text-[var(--color-muted)]">
          {message}
        </p>
      )}
    </div>
  )
}

export function HandoffSection({ s, set, err, verification }: SectionProps & { verification: HandoffVerification }) {
  const h = s.handoff
  return (
    <>
      <Group title="Human hand-off" description="Visitors can send their question and the conversation to your team by email.">
        <Toggle label="Allow hand-off to a human" description="Adds “Talk to a human” to the chat footer." checked={h.enabled} onChange={(enabled) => set("handoff", { enabled })} />
        {h.enabled && (
          <>
            <TextInput
              label="Send hand-offs to"
              type="email"
              value={h.email}
              onChange={(email) => set("handoff", { email })}
              error={err("handoff.email")}
              placeholder="support@example.com"
              hint="Replying to the email reaches the visitor directly. Never shown to visitors."
            />
            <ConfirmAddress email={h.email} verification={verification} />
            <Toggle
              label="Offer it when the assistant can't answer"
              description="Shows a “Talk to a human” button right under “I don't know” replies."
              checked={h.offerWhenUnsure}
              onChange={(offerWhenUnsure) => set("handoff", { offerWhenUnsure })}
            />
          </>
        )}
      </Group>
      <Group title="Lead capture" description="Collect contact details so no conversation is lost.">
        <ChoiceCards
          label="Ask for contact details"
          value={h.leadCapture}
          onChange={(leadCapture) => set("handoff", { leadCapture })}
          options={[
            { value: "off", title: "Only on hand-off", description: "Visitors share details when they ask for a human." },
            { value: "before-chat", title: "Before the chat starts", description: "A short form appears before the first message." },
          ]}
        />
        {h.leadCapture === "before-chat" && (
          <>
            <Field label="Fields" hint="Email is always asked for.">
              <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
                <Toggle label="Name" checked={h.leadFields.name} onChange={(name) => set("handoff", { leadFields: { ...h.leadFields, name } })} />
                <Toggle label="Phone number" checked={h.leadFields.phone} onChange={(phone) => set("handoff", { leadFields: { ...h.leadFields, phone } })} />
              </div>
            </Field>
            <Toggle
              label="Required"
              description="Off: visitors can skip the form. On: they must fill it in to chat, which lowers the number of conversations."
              checked={h.leadRequired}
              onChange={(leadRequired) => set("handoff", { leadRequired })}
            />
          </>
        )}
      </Group>
    </>
  )
}

// ---------- Install & security ----------

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          aria-live="polite"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            } catch {}
          }}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-transparent px-2.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)]"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3 font-mono text-[0.8125rem] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function InstallSection({
  s,
  set,
  err,
  listErr,
  siteKey,
  widgetUrl,
  canEdit,
  dirty,
  onRotate,
}: SectionProps & { siteKey: string; widgetUrl: string; canEdit: boolean; dirty: boolean; onRotate: () => Promise<void> }) {
  const sec = s.security
  const [confirming, setConfirming] = useState(false)
  const [rotating, setRotating] = useState(false)
  const snippet = `<script src="${widgetUrl}" data-site-key="${siteKey}" async></script>`
  const api = `// Optional: control the widget from your own code
Apex.open()                       // open the chat
Apex.send("Where is my order?")   // open and ask a question
Apex.identify({ name: "Ada", email: "ada@example.com" })
Apex.on("message", (m) => console.log(m.text))`

  return (
    <>
      <Group title="Install" description="Paste this before the closing </body> tag on every page where the chat should appear.">
        <div data-tour="embed">
          <CodeBlock label="Embed code" code={snippet} />
        </div>
        {sec.allowedOrigins.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
            Add your website under “Allowed websites” below. Until then the widget refuses to load anywhere.
          </p>
        )}
        <CodeBlock label="JavaScript API" code={api} />
      </Group>

      <Group title="Allowed websites" description="The widget only answers on these sites, so a copied embed code is useless elsewhere.">
        <div data-tour="origins">
          <ListEditor
            label="Website addresses"
            items={sec.allowedOrigins}
            onChange={(allowedOrigins) => set("security", { allowedOrigins })}
            max={LIMITS.origins}
            maxLength={LIMITS.url}
            placeholder="https://www.example.com"
            hint="Include every variant visitors use: with and without www, and staging sites."
            errors={listErr("security.allowedOrigins")}
            mono
          />
        </div>
      </Group>

      <Group title="Usage limits" description="Guards against abuse and runaway costs.">
        <div className={grid2}>
          <NumberInput
            label="Messages per visitor per minute"
            value={sec.messagesPerMinute}
            onChange={(messagesPerMinute) => set("security", { messagesPerMinute })}
            min={LIMITS.messagesPerMinute.min}
            max={LIMITS.messagesPerMinute.max}
            error={err("security.messagesPerMinute")}
          />
          <NumberInput
            label="Longest message"
            unit="characters"
            value={sec.maxMessageChars}
            onChange={(maxMessageChars) => set("security", { maxMessageChars })}
            min={LIMITS.maxMessageChars.min}
            max={LIMITS.maxMessageChars.max}
            error={err("security.maxMessageChars")}
          />
          <NumberInput
            label="Daily token budget"
            unit="tokens"
            step={10000}
            value={sec.dailyTokenBudget}
            onChange={(dailyTokenBudget) => set("security", { dailyTokenBudget })}
            min={LIMITS.dailyTokenBudget.min}
            max={LIMITS.dailyTokenBudget.max}
            error={err("security.dailyTokenBudget")}
            hint="When it runs out, the chat offers a hand-off until midnight UTC."
          />
          <NumberInput
            label="Keep conversations for"
            unit="days"
            value={sec.retentionDays}
            onChange={(retentionDays) => set("security", { retentionDays })}
            min={LIMITS.retentionDays.min}
            max={LIMITS.retentionDays.max}
            error={err("security.retentionDays")}
            hint="Deleted automatically afterwards (KVKK / GDPR)."
          />
        </div>
      </Group>

      <Group title="Site key" description="The public key in your embed code. Rotate it if it's being used somewhere it shouldn't be.">
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 py-2.5 font-mono text-[0.8125rem]">{siteKey}</code>
          {!confirming ? (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setConfirming(true)}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Rotate key
            </button>
          ) : null}
        </div>
        {confirming && (
          <div role="alertdialog" aria-label="Confirm key rotation" className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <p className="text-sm">
              The current embed code stops working immediately. You'll need to update the snippet on every site.
              {dirty && " Save or discard your other changes first."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={rotating || dirty}
                onClick={async () => {
                  setRotating(true)
                  try {
                    await onRotate()
                    setConfirming(false)
                  } finally {
                    setRotating(false)
                  }
                }}
                className="h-9 cursor-pointer rounded-lg border-0 bg-red-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rotating ? "Rotating…" : "Rotate now"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-9 cursor-pointer rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)]">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Group>
    </>
  )
}
