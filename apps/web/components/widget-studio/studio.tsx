"use client"

import {
  Code2,
  Cpu,
  LifeBuoy,
  LoaderCircle,
  MessageSquareText,
  Monitor,
  MousePointerClick,
  Palette,
  Settings2,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { checkSettings, LANGS, type BotSettings, type Lang, type SettingsIssue } from "@apex/db/bot-settings"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { BotJson } from "@/lib/bot"
import { format, LOCALE_META } from "@/lib/i18n"
import { formatDate, plural } from "@/lib/i18n/format"
import { translateIssues } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"
import { InstallGuide } from "./install-guide"
import { WidgetPreview, type PreviewView } from "./preview"
import {
  AppearanceSection,
  BehaviorSection,
  GeneralSection,
  HandoffSection,
  InstallSection,
  MessagesSection,
  ModelSection,
  PersonaSection,
  type SectionProps,
  type SetSection,
} from "./sections"

type SectionId = "general" | "appearance" | "messages" | "behavior" | "model" | "persona" | "handoff" | "install"

// Labels and blurbs come from the studio dictionary
const SECTIONS: { id: SectionId; icon: LucideIcon; covers: (keyof BotSettings)[] }[] = [
  { id: "general", icon: Settings2, covers: ["general"] },
  { id: "appearance", icon: Palette, covers: ["appearance"] },
  { id: "messages", icon: MessageSquareText, covers: ["messages"] },
  { id: "behavior", icon: MousePointerClick, covers: ["behavior"] },
  { id: "model", icon: Cpu, covers: ["model"] },
  { id: "persona", icon: Sparkles, covers: ["persona"] },
  { id: "handoff", icon: LifeBuoy, covers: ["handoff"] },
  { id: "install", icon: Code2, covers: ["security"] },
]

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function WidgetStudio({
  initial,
  widgetUrl,
  initialSection,
  guide = false,
}: {
  initial: BotJson
  widgetUrl: string
  /** From ?section=, ignored unless it names a section. */
  initialSection?: string
  guide?: boolean
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.studio
  const router = useRouter()
  const [bot, setBot] = useState(initial)
  const [draft, setDraft] = useState<BotSettings>(initial.settings)
  const [section, setSection] = useState<SectionId>(() => SECTIONS.find((s) => s.id === initialSection)?.id ?? "general")
  // the command palette links to ?section= on this same page, which doesn't remount it
  useEffect(() => {
    const id = SECTIONS.find((s) => s.id === initialSection)?.id
    if (id) setSection(id)
  }, [initialSection])
  const [guiding, setGuiding] = useState(guide)
  const [lang, setLang] = useState<Lang>(initial.settings.general.defaultLang)
  const [save, setSave] = useState<SaveState>({ kind: "idle" })
  // issues from the server win until the next edit; local checks run on every change
  const [serverIssues, setServerIssues] = useState<SettingsIssue[] | null>(null)
  const [showIssues, setShowIssues] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(true)
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [view, setView] = useState<PreviewView>("welcome")
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => setSystemDark(document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : mq.matches)
    sync()
    mq.addEventListener("change", sync)
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] })
    return () => {
      mq.removeEventListener("change", sync)
      obs.disconnect()
    }
  }, [])

  const dirty = !same(draft, bot.settings)
  const localIssues = useMemo(() => translateIssues(checkSettings(draft), locale), [draft, locale])
  const issues = serverIssues ?? localIssues
  const issueMap = useMemo(() => new Map(issues.map((i) => [i.path, i.message])), [issues])

  // Errors show once the field was touched (differs from the saved value) or after a save attempt
  const visible = useCallback(
    (path: string) => {
      if (showIssues || serverIssues) return true
      const get = (o: unknown) => path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o)
      return !same(get(draft), get(bot.settings))
    },
    [showIssues, serverIssues, draft, bot.settings],
  )
  const err = useCallback((path: string) => (visible(path) ? issueMap.get(path) : undefined), [issueMap, visible])
  const listErr = useCallback(
    (path: string) => {
      if (!visible(path)) return undefined
      const out: Record<string, string> = {}
      for (const [p, msg] of issueMap) {
        if (p === path) out[""] = msg
        else if (p.startsWith(`${path}.`)) out[p.slice(path.length + 1)] = msg
      }
      return Object.keys(out).length ? out : undefined
    },
    [issueMap, visible],
  )

  const countFor = (id: SectionId) => {
    const covers = SECTIONS.find((s) => s.id === id)!.covers
    return issues.filter((i) => covers.some((c) => i.path === c || i.path.startsWith(`${c}.`)) && (showIssues || serverIssues || visible(i.path))).length
  }

  const set: SetSection = useCallback((key, patch) => {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
    setServerIssues(null)
    setSave((s) => (s.kind === "saving" ? s : { kind: "idle" }))
  }, [])

  // Show the lead form in the preview while editing lead capture, the full chat while editing answers
  useEffect(() => {
    if (section === "handoff" && draft.handoff.leadCapture === "before-chat") setView("lead")
    else if (section === "behavior" || section === "persona") setView("conversation")
    else setView((v) => (v === "lead" && draft.handoff.leadCapture !== "before-chat" ? "welcome" : v))
  }, [section, draft.handoff.leadCapture])

  const doSave = useCallback(async () => {
    if (!dirty || save.kind === "saving" || !bot.canEdit) return
    if (localIssues.length) {
      setShowIssues(true)
      const first = SECTIONS.find((s) => s.covers.some((c) => localIssues.some((i) => i.path.startsWith(c))))
      if (first) setSection(first.id)
      setSave({ kind: "error", message: plural(localIssues.length, t.fixBeforeSaving, locale) })
      return
    }
    setSave({ kind: "saving" })
    try {
      const res = await fetch("/api/bot", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId: bot.id, settings: draft, version: bot.version }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setBot(body)
        setDraft(body.settings)
        setShowIssues(false)
        setSave({ kind: "saved" })
        // setup progress in the header is server-rendered
        router.refresh()
        return
      }
      if (body.error === "invalid_settings") {
        setServerIssues(body.issues)
        setShowIssues(true)
      }
      setSave({ kind: "error", message: body.message ?? t.saveFailed })
    } catch {
      setSave({ kind: "error", message: t.offline })
    }
  }, [dirty, save.kind, bot, draft, localIssues, router, t, locale])

  const discard = () => {
    setDraft(bot.settings)
    setServerIssues(null)
    setShowIssues(false)
    setSave({ kind: "idle" })
  }

  const rotate = async () => {
    const res = await fetch("/api/bot/site-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ botId: bot.id }) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSave({ kind: "error", message: body.message ?? t.rotateFailed })
      return
    }
    setBot(body)
    setDraft(body.settings)
  }

  // ⌘S / Ctrl+S saves; leaving with unsaved changes asks first
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void doSave()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [doSave])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const props: SectionProps = { s: draft, set, lang, err, listErr }
  const current = t.sections[section]

  const status =
    save.kind === "saving" ? (
      <span className="flex items-center gap-1.5">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t.saving}
      </span>
    ) : save.kind === "error" ? (
      <span className="text-red-500">{save.message}</span>
    ) : dirty ? (
      t.unsaved
    ) : save.kind === "saved" ? (
      t.saved
    ) : (
      format(t.lastSaved, { date: formatDate(bot.updatedAt, locale, { dateStyle: "medium", timeStyle: "short" }) })
    )

  const pill = (on: boolean) =>
    cn(
      "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border-0 px-2.5 text-xs font-semibold transition-colors",
      on ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
    )

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <p role="status" aria-live="polite" className="truncate text-xs text-[var(--color-muted)]">
            {bot.canEdit ? status : t.viewOnly}
          </p>
        </div>
        <div role="radiogroup" aria-label={t.editingLanguage} className="flex rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              aria-label={LOCALE_META[l].name}
              title={LOCALE_META[l].name}
              lang={LOCALE_META[l].hreflang}
              onClick={() => setLang(l)}
              className={pill(lang === l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={discard}
            disabled={!dirty || save.kind === "saving"}
            className="h-9 cursor-pointer rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.discard}
          </button>
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={!dirty || save.kind === "saving" || !bot.canEdit}
            data-tour="save"
            title={t.saveTitle}
            className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {save.kind === "saving" ? t.saving : t.save}
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[13rem_minmax(0,1fr)_minmax(24rem,30rem)]">
        <nav aria-label={t.sectionsLabel} className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map(({ id, icon: Icon }) => {
              const n = countFor(id)
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={section === id ? "page" : undefined}
                    onClick={() => setSection(id)}
                    className={cn(
                      "flex h-10 w-full cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg border-0 px-3 text-left text-sm transition-colors",
                      section === id
                        ? "bg-[var(--color-bubble)] font-semibold text-[var(--color-text)]"
                        : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-bubble)]/60 hover:text-[var(--color-text)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{t.sections[id].label}</span>
                    {n > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[0.6875rem] font-semibold text-white" aria-label={format(t.toFix, { n })}>
                        {n}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">{current.label}</h2>
            <p className="text-sm text-[var(--color-muted)]">{current.blurb}</p>
          </div>
          <fieldset disabled={!bot.canEdit} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            {section === "general" && <GeneralSection {...props} />}
            {section === "appearance" && <AppearanceSection {...props} />}
            {section === "messages" && <MessagesSection {...props} />}
            {section === "behavior" && <BehaviorSection {...props} />}
            {section === "model" && <ModelSection {...props} />}
            {section === "persona" && <PersonaSection {...props} />}
            {section === "handoff" && (
              <HandoffSection
                {...props}
                verification={{
                  botId: bot.id,
                  savedVerified: bot.handoffVerified,
                  savedEmail: bot.settings.handoff.email,
                  onConfirmed: (next) => setBot((b) => ({ ...b, ...next })),
                }}
              />
            )}
            {section === "install" && (
              <InstallSection {...props} siteKey={bot.siteKey} widgetUrl={widgetUrl} canEdit={bot.canEdit} dirty={dirty} onRotate={rotate} />
            )}
          </fieldset>
          {guiding && section === "install" && (
            <InstallGuide
              onClose={() => {
                setGuiding(false)
                // so a reload doesn't start the walkthrough again
                window.history.replaceState(null, "", window.location.pathname + "?section=install")
              }}
            />
          )}
        </div>

        <aside aria-label={t.preview.label} className="flex flex-col gap-3 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-24 2xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t.preview.label}</h2>
            <div className="flex flex-wrap gap-1">
              <div className="flex rounded-lg border border-[var(--color-line)] p-0.5" role="radiogroup" aria-label={t.preview.screen}>
                <button type="button" role="radio" aria-checked={device === "desktop"} aria-label={t.preview.desktop} onClick={() => setDevice("desktop")} className={pill(device === "desktop")}>
                  <Monitor className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" role="radio" aria-checked={device === "mobile"} aria-label={t.preview.phone} onClick={() => setDevice("mobile")} className={pill(device === "mobile")}>
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <div className="flex rounded-lg border border-[var(--color-line)] p-0.5" role="radiogroup" aria-label={t.preview.content}>
                {(
                  [
                    ["welcome", t.preview.welcome],
                    ["conversation", t.preview.chat],
                    ...(draft.handoff.leadCapture === "before-chat" ? [["lead", t.preview.lead]] : []),
                  ] as [PreviewView, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={view === v && previewOpen}
                    onClick={() => {
                      setView(v)
                      setPreviewOpen(true)
                    }}
                    className={pill(view === v && previewOpen)}
                  >
                    {label}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={!previewOpen} onClick={() => setPreviewOpen(false)} className={pill(!previewOpen)}>
                  {t.preview.closed}
                </button>
              </div>
            </div>
          </div>
          <WidgetPreview
            settings={draft}
            lang={lang}
            open={previewOpen}
            device={device}
            dark={systemDark}
            view={view}
            onToggle={() => setPreviewOpen((o) => !o)}
          />
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            {format(t.preview.showing, { lang: t.langNames[lang] })}
            {draft.appearance.theme === "auto" ? format(t.preview.deviceMode, { mode: systemDark ? t.preview.dark : t.preview.light }) : ""}
            {t.preview.toggleHint}
          </p>
        </aside>
      </div>
    </div>
  )
}
