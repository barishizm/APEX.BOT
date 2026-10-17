"use client"

import { AlignLeft, AlignRight, Check, Copy, ImageIcon, KeyRound, TriangleAlert } from "lucide-react"
import { useState, type ReactNode } from "react"
import {
  FONT_STACKS,
  LANGS,
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
import { useAppI18n } from "@/components/i18n/app-provider"
import { format, LOCALE_META, type Locale } from "@/lib/i18n"
import { formatNumber, plural } from "@/lib/i18n/format"
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

// Sample text in each widget language, shown as input placeholders
const EXAMPLES: Record<Lang, { buttonLabel: string; suggestion: string; teaser: string }> = {
  tr: { buttonLabel: "Bize sorun", suggestion: "Kargo ne kadar sürer?", teaser: "Sorunuz mu var? Hemen yanıtlayalım 👋" },
  en: { buttonLabel: "Ask us", suggestion: "How long does shipping take?", teaser: "Questions? We answer in seconds 👋" },
  lt: { buttonLabel: "Klauskite mūsų", suggestion: "Kiek laiko trunka pristatymas?", teaser: "Turite klausimų? Atsakysime per kelias sekundes 👋" },
  lv: { buttonLabel: "Jautājiet mums", suggestion: "Cik ilgi notiek piegāde?", teaser: "Ir jautājumi? Atbildēsim dažu sekunžu laikā 👋" },
  et: { buttonLabel: "Küsige meilt", suggestion: "Kui kaua tarne aega võtab?", teaser: "Küsimusi? Vastame mõne sekundiga 👋" },
}

function LangTag({ lang }: { lang: Lang }) {
  return (
    <span className="ml-1.5 rounded bg-[var(--color-bubble)] px-1.5 py-px align-middle text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
      {lang}
    </span>
  )
}

/** Hint under a translated field when other languages still need text. */
function useMissingHint() {
  const t = useAppI18n().t.studio
  return (value: Localized, lang: Lang, hint?: ReactNode): ReactNode => {
    const missing = LANGS.filter((l) => l !== lang && !value[l]?.trim())
    if (value[lang].trim() && missing.length > 0) return format(t.missingOther, { lang: missing.map((l) => t.langNames[l]).join(", ") })
    return hint
  }
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
  const missingHint = useMissingHint()
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
  const t = useAppI18n().t.studio.general
  const g = s.general
  return (
    <>
      <Group title={t.identity} description={t.identityHint}>
        <div className={grid2}>
          <TextInput label={t.botName} value={g.botName} onChange={(botName) => set("general", { botName })} max={LIMITS.botName} error={err("general.botName")} placeholder="Apex" />
          <TextInput
            label={t.companyName}
            value={g.companyName}
            onChange={(companyName) => set("general", { companyName })}
            max={LIMITS.companyName}
            error={err("general.companyName")}
            placeholder="Crest Cycles"
            hint={t.companyHint}
          />
        </div>
      </Group>
      <Group title={t.language} description={t.languageHint}>
        <Segmented
          label={t.defaultLang}
          value={g.defaultLang}
          onChange={(defaultLang) => set("general", { defaultLang })}
          options={LANGS.map((l) => ({ value: l, label: LOCALE_META[l].name }))}
          hint={t.defaultLangHint}
        />
        <ChoiceCards
          label={t.interfaceLang}
          value={g.languageMode}
          onChange={(languageMode) => set("general", { languageMode })}
          options={[
            { value: "auto", ...t.auto },
            { value: "fixed", ...t.fixed },
          ]}
        />
      </Group>
    </>
  )
}

// ---------- Appearance ----------

export function AppearanceSection({ s, set, lang, err }: SectionProps) {
  const t = useAppI18n().t.studio.appearance
  const a = s.appearance
  return (
    <>
      <Group title={t.colors}>
        <ColorField
          label={t.brandColor}
          value={a.primaryColor}
          onChange={(primaryColor) => set("appearance", { primaryColor })}
          error={err("appearance.primaryColor")}
          hint={t.brandColorHint}
        />
        <Segmented
          label={t.theme}
          value={a.theme}
          onChange={(theme) => set("appearance", { theme })}
          options={[
            { value: "auto", label: t.themes.auto },
            { value: "light", label: t.themes.light },
            { value: "dark", label: t.themes.dark },
          ]}
        />
      </Group>

      <Group title={t.launcher} description={t.launcherHint}>
        <ChoiceCards
          label={t.icon}
          columns={5}
          value={a.launcherIcon}
          onChange={(launcherIcon) => set("appearance", { launcherIcon })}
          options={[
            ...(Object.keys(LAUNCHER_ICONS) as (keyof typeof LAUNCHER_ICONS)[]).map((key) => {
              const Icon = LAUNCHER_ICONS[key]
              return { value: key, title: t.icons[key], icon: <Icon className="h-4 w-4" aria-hidden /> }
            }),
            { value: "custom" as const, title: t.icons.custom, icon: <ImageIcon className="h-4 w-4" aria-hidden /> },
          ]}
        />
        {a.launcherIcon === "custom" && (
          <ImageField
            label={t.launcherImage}
            value={a.launcherImage}
            onChange={(launcherImage) => set("appearance", { launcherImage })}
            error={err("appearance.launcherImage")}
            background={a.primaryColor}
            hint={t.launcherImageHint}
          />
        )}
        <div className={grid2}>
          <LocalizedInput
            label={t.buttonLabel}
            value={a.launcherLabel}
            lang={lang}
            onChange={(launcherLabel) => set("appearance", { launcherLabel })}
            max={LIMITS.launcherLabel}
            error={err(`appearance.launcherLabel.${lang}`)}
            placeholder={EXAMPLES[lang].buttonLabel}
            hint={t.buttonLabelHint}
          />
          <Segmented
            label={t.size}
            value={a.launcherSize}
            onChange={(launcherSize) => set("appearance", { launcherSize })}
            options={[
              { value: "small", label: t.sizes.small },
              { value: "medium", label: t.sizes.medium },
              { value: "large", label: t.sizes.large },
            ]}
          />
        </div>
        <Segmented
          label={t.position}
          value={a.position}
          onChange={(position) => set("appearance", { position })}
          options={[
            { value: "bottom-left", label: <><AlignLeft className="h-4 w-4" aria-hidden /> {t.positions.left}</> },
            { value: "bottom-right", label: <><AlignRight className="h-4 w-4" aria-hidden /> {t.positions.right}</> },
          ]}
        />
        <div className={grid2}>
          <Slider label={t.sideSpacing} value={a.offsetX} onChange={(offsetX) => set("appearance", { offsetX })} min={LIMITS.offset.min} max={LIMITS.offset.max} unit="px" error={err("appearance.offsetX")} />
          <Slider
            label={t.bottomSpacing}
            value={a.offsetY}
            onChange={(offsetY) => set("appearance", { offsetY })}
            min={LIMITS.offset.min}
            max={LIMITS.offset.max}
            unit="px"
            error={err("appearance.offsetY")}
            hint={t.bottomSpacingHint}
          />
        </div>
      </Group>

      <Group title={t.window}>
        <div className={grid2}>
          <Segmented
            label={t.avatar}
            value={a.avatar}
            onChange={(avatar) => set("appearance", { avatar })}
            options={[
              { value: "initial", label: t.avatars.initial },
              { value: "icon", label: t.avatars.icon },
              { value: "image", label: t.avatars.image },
            ]}
          />
          <Segmented
            label={t.width}
            value={a.panelWidth}
            onChange={(panelWidth) => set("appearance", { panelWidth })}
            options={[
              { value: "compact", label: t.widths.compact },
              { value: "standard", label: t.widths.standard },
              { value: "wide", label: t.widths.wide },
            ]}
          />
        </div>
        {a.avatar === "image" && (
          <ImageField
            label={t.avatarUrl}
            value={a.avatarUrl}
            onChange={(avatarUrl) => set("appearance", { avatarUrl })}
            error={err("appearance.avatarUrl")}
            background={a.primaryColor}
            hint={t.avatarUrlHint}
          />
        )}
        <Slider label={t.radius} value={a.radius} onChange={(radius) => set("appearance", { radius })} min={LIMITS.radius.min} max={LIMITS.radius.max} unit="px" error={err("appearance.radius")} />
        <ChoiceCards
          label={t.font}
          columns={4}
          value={a.font}
          onChange={(font) => set("appearance", { font })}
          options={(["system", "rounded", "serif", "mono"] as const).map((f) => ({
            value: f,
            title: <span style={{ fontFamily: FONT_STACKS[f] }}>{t.fonts[f]}</span>,
            description: <span style={{ fontFamily: FONT_STACKS[f] }}>Aa Ğğ Şş 123</span>,
          }))}
        />
        <Toggle
          label={t.branding}
          description={t.brandingHint}
          checked={a.showBranding}
          onChange={(showBranding) => set("appearance", { showBranding })}
        />
      </Group>
    </>
  )
}

// ---------- Messages ----------

export function MessagesSection({ s, set, lang, err, listErr }: SectionProps) {
  const t = useAppI18n().t.studio.messages
  const m = s.messages
  return (
    <>
      <Group title={t.welcome} description={t.welcomeHint}>
        <LocalizedInput label={t.greeting} multiline value={m.greeting} lang={lang} onChange={(greeting) => set("messages", { greeting })} max={LIMITS.greeting} error={err(`messages.greeting.${lang}`)} />
        <ListEditor
          label={
            <>
              {t.suggestions}
              <LangTag lang={lang} />
            </>
          }
          items={m.suggestions[lang]}
          onChange={(list) => set("messages", { suggestions: { ...m.suggestions, [lang]: list } })}
          max={LIMITS.suggestions}
          maxLength={LIMITS.suggestion}
          placeholder={EXAMPLES[lang].suggestion}
          hint={t.suggestionsHint}
          errors={listErr(`messages.suggestions.${lang}`)}
        />
        <LocalizedInput label={t.placeholder} value={m.placeholder} lang={lang} onChange={(placeholder) => set("messages", { placeholder })} max={LIMITS.placeholder} error={err(`messages.placeholder.${lang}`)} />
      </Group>
      <Group title={t.noAnswer}>
        <LocalizedInput
          label={t.unknown}
          multiline
          value={m.unknownAnswer}
          lang={lang}
          onChange={(unknownAnswer) => set("messages", { unknownAnswer })}
          max={LIMITS.unknownAnswer}
          error={err(`messages.unknownAnswer.${lang}`)}
          hint={t.unknownHint}
        />
      </Group>
      <Group title={t.footer}>
        <Toggle label={t.disclaimer} description={t.disclaimerHint} checked={m.showDisclaimer} onChange={(showDisclaimer) => set("messages", { showDisclaimer })} />
        {m.showDisclaimer && (
          <LocalizedInput label={t.disclaimerText} value={m.disclaimer} lang={lang} onChange={(disclaimer) => set("messages", { disclaimer })} max={LIMITS.disclaimer} error={err(`messages.disclaimer.${lang}`)} />
        )}
        <TextInput
          label={t.privacyUrl}
          type="url"
          value={m.privacyUrl}
          onChange={(privacyUrl) => set("messages", { privacyUrl })}
          error={err("messages.privacyUrl")}
          placeholder="https://example.com/privacy"
          hint={t.privacyUrlHint}
          mono
        />
      </Group>
    </>
  )
}

// ---------- Behavior ----------

export function BehaviorSection({ s, set, lang, err, listErr }: SectionProps) {
  const t = useAppI18n().t.studio.behavior
  const b = s.behavior
  return (
    <>
      <Group title={t.opening} description={t.openingHint}>
        <Segmented
          label={t.autoOpen}
          value={b.autoOpen}
          onChange={(autoOpen) => set("behavior", { autoOpen })}
          options={[
            { value: "never", label: t.autoOpenOptions.never },
            { value: "delay", label: t.autoOpenOptions.delay },
          ]}
          hint={t.autoOpenHint}
        />
        {b.autoOpen === "delay" && (
          <>
            <Slider label={t.delay} value={b.autoOpenDelay} onChange={(autoOpenDelay) => set("behavior", { autoOpenDelay })} min={LIMITS.autoOpenDelay.min} max={LIMITS.autoOpenDelay.max} unit={t.seconds} error={err("behavior.autoOpenDelay")} />
            <Toggle label={t.onPhones} description={t.onPhonesHint} checked={b.autoOpenOnMobile} onChange={(autoOpenOnMobile) => set("behavior", { autoOpenOnMobile })} />
          </>
        )}
        <LocalizedInput
          label={t.teaser}
          value={b.teaser}
          lang={lang}
          onChange={(teaser) => set("behavior", { teaser })}
          max={LIMITS.teaser}
          error={err(`behavior.teaser.${lang}`)}
          placeholder={EXAMPLES[lang].teaser}
          hint={t.teaserHint}
        />
      </Group>
      <Group title={t.conversation}>
        <Toggle label={t.sources} description={t.sourcesHint} checked={b.showSources} onChange={(showSources) => set("behavior", { showSources })} />
        <Toggle label={t.feedback} description={t.feedbackHint} checked={b.showFeedback} onChange={(showFeedback) => set("behavior", { showFeedback })} />
        <Toggle label={t.sound} description={t.soundHint} checked={b.soundOnReply} onChange={(soundOnReply) => set("behavior", { soundOnReply })} />
        <Toggle label={t.attachments} description={t.attachmentsHint} checked={b.attachments} onChange={(attachments) => set("behavior", { attachments })} />
        <Toggle label={t.voice} description={t.voiceHint} checked={b.voiceInput} onChange={(voiceInput) => set("behavior", { voiceInput })} />
        <Toggle label={t.fullscreen} description={t.fullscreenHint} checked={b.mobileFullscreen} onChange={(mobileFullscreen) => set("behavior", { mobileFullscreen })} />
        <ChoiceCards
          label={t.remember}
          columns={3}
          value={b.persistence}
          onChange={(persistence) => set("behavior", { persistence })}
          options={[
            { value: "tab", ...t.persistence.tab },
            { value: "browser", ...t.persistence.browser },
            { value: "none", ...t.persistence.none },
          ]}
        />
      </Group>
      <Group title={t.where}>
        <ListEditor
          label={t.hide}
          items={b.hiddenPaths}
          onChange={(hiddenPaths) => set("behavior", { hiddenPaths })}
          max={LIMITS.hiddenPaths}
          maxLength={200}
          placeholder="/checkout"
          hint={t.hideHint}
          errors={listErr("behavior.hiddenPaths")}
          mono
        />
      </Group>
    </>
  )
}

// ---------- Model ----------

// Rough per-message token use: system prompt + retrieved excerpts + history in, a short answer out
const EST_INPUT_TOKENS = 3000
const EST_OUTPUT_TOKENS = 300

function estimate(model: ModelInfo, maxOutput: number, locale: Locale): string | null {
  if (!model.price) return null
  const out = Math.min(EST_OUTPUT_TOKENS, maxOutput)
  const per1000 = ((EST_INPUT_TOKENS * model.price.input + out * model.price.output) / 1_000_000) * 1000
  const digits = per1000 < 1 ? 2 : per1000 < 10 ? 1 : 0
  const usd = new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `≈ ${usd.format(per1000)}`
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
  const { t: app, locale } = useAppI18n()
  const t = app.studio.model
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
      <Group title={t.provider} description={t.providerHint}>
        <div role="radiogroup" aria-label={t.provider} className="grid gap-2 sm:grid-cols-3">
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
                <span className="text-xs text-[var(--color-muted)]">{plural(MODELS.filter((m) => m.provider === p.id).length, t.modelCount, locale)}</span>
              </button>
            )
          })}
        </div>
      </Group>

      <Group title={t.model} description={err("model.id") ?? t.modelHint}>
        <div role="radiogroup" aria-label={t.model} className="flex flex-col gap-2">
          {list.map((m) => {
            const on = m.id === mo.id
            const cost = estimate(m, mo.maxOutputTokens, locale)
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
                    <Badge>{t.tiers[m.tier]}</Badge>
                    {m.recommended && <Badge tone="accent">{t.recommended}</Badge>}
                    {m.preview && <Badge tone="warn">{t.previewBadge}</Badge>}
                  </span>
                  <span className="text-xs leading-relaxed text-[var(--color-muted)]">{t.descriptions[m.id] ?? m.description}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.6875rem] text-[var(--color-muted)]">
                    <span>{m.id}</span>
                    {m.context && <span>{format(t.context, { n: m.context })}</span>}
                    {m.price && <span>{format(t.price, { input: m.price.input, output: m.price.output })}</span>}
                    {cost && <span>{format(t.perThousand, { cost })}</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {current?.preview && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
            {t.previewWarning}
          </p>
        )}
        <p className="text-xs leading-relaxed text-[var(--color-muted)]">
          {t.envPre} <code className="font-mono">{PROVIDERS.find((p) => p.id === mo.provider)!.envKey}</code>
          {format(t.envPost, { input: formatNumber(EST_INPUT_TOKENS, locale), output: EST_OUTPUT_TOKENS })}
        </p>
      </Group>

      <Group title={t.generation}>
        <Slider
          label={t.temperature}
          value={current?.temperature ? mo.temperature : 0}
          onChange={(temperature) => set("model", { temperature })}
          min={0}
          max={MAX_TEMPERATURE[mo.provider]}
          step={0.1}
          format={(v) => v.toLocaleString(LOCALE_META[locale].intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          disabled={!current?.temperature}
          error={err("model.temperature")}
          hint={
            current?.temperature
              ? t.temperatureHint
              : format(t.noTemperature, { model: current?.label ?? t.thisModel })
          }
        />
        <Segmented
          label={t.reasoning}
          value={mo.reasoning}
          onChange={(reasoning) => set("model", { reasoning })}
          disabled={!current?.reasoning}
          options={[
            { value: "low", label: t.reasoningOptions.low },
            { value: "medium", label: t.reasoningOptions.medium },
            { value: "high", label: t.reasoningOptions.high },
          ]}
          hint={
            current?.reasoning
              ? t.reasoningHint
              : format(t.noReasoning, { model: current?.label ?? t.thisModel })
          }
        />
        <div className={grid2}>
          <Slider
            label={t.maxLength}
            value={mo.maxOutputTokens}
            onChange={(maxOutputTokens) => set("model", { maxOutputTokens })}
            min={LIMITS.maxOutputTokens.min}
            max={LIMITS.maxOutputTokens.max}
            step={256}
            format={(v) => formatNumber(v, locale)}
            unit={t.tokensUnit}
            error={err("model.maxOutputTokens")}
            hint={t.maxLengthHint}
          />
          <Slider
            label={t.memory}
            value={mo.historyMessages}
            onChange={(historyMessages) => set("model", { historyMessages })}
            min={LIMITS.historyMessages.min}
            max={LIMITS.historyMessages.max}
            unit={t.messagesUnit}
            error={err("model.historyMessages")}
            hint={t.memoryHint}
          />
        </div>
      </Group>

      <Group title={t.fallback} description={t.fallbackHint}>
        <Toggle label={t.useFallback} checked={mo.fallback.enabled} onChange={(enabled) => set("model", { fallback: { ...mo.fallback, enabled } })} />
        {mo.fallback.enabled && (
          <Select
            label={t.fallbackLabel}
            value={`${mo.fallback.provider}:${mo.fallback.id}`}
            onChange={(v) => {
              const [provider, ...rest] = v.split(":")
              set("model", { fallback: { ...mo.fallback, provider: provider as Provider, id: rest.join(":") } })
            }}
            options={MODELS.filter((m) => !(m.provider === mo.provider && m.id === mo.id)).map((m) => ({
              value: `${m.provider}:${m.id}`,
              label: `${m.label}${m.preview ? t.previewSuffix : ""}`,
              group: PROVIDERS.find((p) => p.id === m.provider)!.label,
            }))}
            error={err("model.fallback.id")}
            hint={t.fallbackSelectHint}
          />
        )}
      </Group>
    </>
  )
}

// ---------- Persona ----------

export function PersonaSection({ s, set, err, listErr }: SectionProps) {
  const t = useAppI18n().t.studio.persona
  const p = s.persona
  return (
    <>
      <Group title={t.voice}>
        <ChoiceCards
          label={t.tone}
          value={p.tone}
          onChange={(tone) => set("persona", { tone })}
          options={(["friendly", "formal", "concise", "detailed"] as const).map((value) => ({ value, ...t.tones[value] }))}
        />
        <Segmented
          label={t.length}
          value={p.responseLength}
          onChange={(responseLength) => set("persona", { responseLength })}
          options={[
            { value: "short", label: t.lengths.short },
            { value: "balanced", label: t.lengths.balanced },
            { value: "detailed", label: t.lengths.detailed },
          ]}
          hint={t.lengthHint}
        />
        <Toggle label={t.emoji} description={t.emojiHint} checked={p.useEmoji} onChange={(useEmoji) => set("persona", { useEmoji })} />
      </Group>
      <Group title={t.instructions} description={t.instructionsHint}>
        <TextArea
          label={t.custom}
          rows={7}
          value={p.instructions}
          onChange={(instructions) => set("persona", { instructions })}
          max={LIMITS.instructions}
          error={err("persona.instructions")}
          placeholder={t.customPlaceholder}
          hint={t.customHint}
        />
        <ListEditor
          label={t.decline}
          items={p.blockedTopics}
          onChange={(blockedTopics) => set("persona", { blockedTopics })}
          max={LIMITS.blockedTopics}
          maxLength={LIMITS.blockedTopic}
          placeholder={t.declinePlaceholder}
          hint={t.declineHint}
          errors={listErr("persona.blockedTopics")}
        />
      </Group>
      <Group title={t.confidence} description={t.confidenceHint}>
        <ChoiceCards
          label={t.threshold}
          columns={3}
          value={p.confidence}
          onChange={(confidence) => set("persona", { confidence })}
          options={[
            { value: "strict", ...t.confidenceOptions.strict },
            { value: "balanced", ...t.confidenceOptions.balanced },
            { value: "lenient", ...t.confidenceOptions.lenient },
          ]}
        />
      </Group>
    </>
  )
}

// ---------- Hand-off ----------

/** What the handoff section needs to know about confirmation, beyond the settings themselves. */
export interface HandoffVerification {
  /** The website being edited; the confirmation is for its bot. */
  botId: string
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
  const { t: app } = useAppI18n()
  const t = app.studio.handoff
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const address = email.trim().toLowerCase()
  const verified = (verification.savedVerified && address === verification.savedEmail.toLowerCase()) || confirmed === address
  if (!address || verified) {
    return verified && address ? <p className="m-0 text-sm text-[var(--color-muted)]">{t.confirmed}</p> : null
  }

  const call = async (url: string, body: object) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, botId: verification.botId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setMessage(data.issues?.[0]?.message ?? data.message ?? app.studio.generic)
      return res.ok ? data : null
    } catch {
      setMessage(app.studio.offline)
      return null
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
      <p className="m-0 text-sm">{t.unconfirmed}</p>
      {sentTo === address ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label={t.code}
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
            {t.confirm}
          </button>
          <button
            type="button"
            disabled={busy}
            className={LINK_BUTTON}
            onClick={async () => {
              if (await call("/api/bot/handoff-email", { email: address })) setMessage(t.newCode)
            }}
          >
            {t.resend}
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
                setMessage(format(t.codeSent, { email: address }))
              }
            }}
          >
            {t.sendCode}
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
  const t = useAppI18n().t.studio.handoff
  const h = s.handoff
  return (
    <>
      <Group title={t.title} description={t.hint}>
        <Toggle label={t.allow} description={t.allowHint} checked={h.enabled} onChange={(enabled) => set("handoff", { enabled })} />
        {h.enabled && (
          <>
            <TextInput
              label={t.sendTo}
              type="email"
              value={h.email}
              onChange={(email) => set("handoff", { email })}
              error={err("handoff.email")}
              placeholder="support@example.com"
              hint={t.sendToHint}
            />
            <ConfirmAddress email={h.email} verification={verification} />
            <Toggle
              label={t.offer}
              description={t.offerHint}
              checked={h.offerWhenUnsure}
              onChange={(offerWhenUnsure) => set("handoff", { offerWhenUnsure })}
            />
          </>
        )}
        {/* Without a working hand-off, "I don't know" replies point here instead */}
        {(!h.enabled || !verification.savedVerified) && (
          <TextInput
            label={t.contact}
            value={h.contact}
            onChange={(contact) => set("handoff", { contact })}
            error={err("handoff.contact")}
            placeholder="hello@example.com"
            hint={t.contactHint}
          />
        )}
      </Group>
      <Group title={t.leads} description={t.leadsHint}>
        <ChoiceCards
          label={t.ask}
          value={h.leadCapture}
          onChange={(leadCapture) => set("handoff", { leadCapture })}
          options={[
            { value: "off", ...t.leadOptions.off },
            { value: "before-chat", ...t.leadOptions.before },
          ]}
        />
        {h.leadCapture === "before-chat" && (
          <>
            <Field label={t.fields} hint={t.fieldsHint}>
              <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
                <Toggle label={t.name} checked={h.leadFields.name} onChange={(name) => set("handoff", { leadFields: { ...h.leadFields, name } })} />
                <Toggle label={t.phone} checked={h.leadFields.phone} onChange={(phone) => set("handoff", { leadFields: { ...h.leadFields, phone } })} />
              </div>
            </Field>
            <Toggle
              label={t.required}
              description={t.requiredHint}
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
  const t = useAppI18n().t.studio.install
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
          {copied ? t.copied : t.copy}
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
  const t = useAppI18n().t.studio.install
  const c = t.apiComments
  const sec = s.security
  const [confirming, setConfirming] = useState(false)
  const [rotating, setRotating] = useState(false)
  const snippet = `<script src="${widgetUrl}" data-site-key="${siteKey}" async></script>`
  const ask = `Apex.send("${c.question}")`
  const api = `// ${c.intro}
${"Apex.open()".padEnd(ask.length + 3)}// ${c.open}
${ask}   // ${c.send}
Apex.identify({ name: "Ada", email: "ada@example.com" })
Apex.on("message", (m) => console.log(m.text))`

  return (
    <>
      <Group title={t.title} description={t.hint}>
        <div data-tour="embed">
          <CodeBlock label={t.embed} code={snippet} />
        </div>
        {sec.allowedOrigins.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
            {t.noOrigins}
          </p>
        )}
        <CodeBlock label={t.api} code={api} />
      </Group>

      <Group title={t.allowed} description={t.allowedHint}>
        <div data-tour="origins">
          <ListEditor
            label={t.addresses}
            items={sec.allowedOrigins}
            onChange={(allowedOrigins) => set("security", { allowedOrigins })}
            max={LIMITS.origins}
            maxLength={LIMITS.url}
            placeholder="https://www.example.com"
            hint={t.addressesHint}
            errors={listErr("security.allowedOrigins")}
            mono
          />
        </div>
      </Group>

      <Group title={t.limits} description={t.limitsHint}>
        <div className={grid2}>
          <NumberInput
            label={t.perMinute}
            value={sec.messagesPerMinute}
            onChange={(messagesPerMinute) => set("security", { messagesPerMinute })}
            min={LIMITS.messagesPerMinute.min}
            max={LIMITS.messagesPerMinute.max}
            error={err("security.messagesPerMinute")}
          />
          <NumberInput
            label={t.longest}
            unit={t.characters}
            value={sec.maxMessageChars}
            onChange={(maxMessageChars) => set("security", { maxMessageChars })}
            min={LIMITS.maxMessageChars.min}
            max={LIMITS.maxMessageChars.max}
            error={err("security.maxMessageChars")}
          />
          <NumberInput
            label={t.budget}
            unit={t.tokens}
            step={10000}
            value={sec.dailyTokenBudget}
            onChange={(dailyTokenBudget) => set("security", { dailyTokenBudget })}
            min={LIMITS.dailyTokenBudget.min}
            max={LIMITS.dailyTokenBudget.max}
            error={err("security.dailyTokenBudget")}
            hint={t.budgetHint}
          />
          <NumberInput
            label={t.retention}
            unit={t.days}
            value={sec.retentionDays}
            onChange={(retentionDays) => set("security", { retentionDays })}
            min={LIMITS.retentionDays.min}
            max={LIMITS.retentionDays.max}
            error={err("security.retentionDays")}
            hint={t.retentionHint}
          />
        </div>
      </Group>

      <Group title={t.siteKey} description={t.siteKeyHint}>
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
              {t.rotate}
            </button>
          ) : null}
        </div>
        {confirming && (
          <div role="alertdialog" aria-label={t.confirmRotation} className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <p className="text-sm">
              {t.rotateWarning}
              {dirty && t.saveFirst}
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
                {rotating ? t.rotating : t.rotateNow}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-9 cursor-pointer rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)]">
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </Group>
    </>
  )
}
