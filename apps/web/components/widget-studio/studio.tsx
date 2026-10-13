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
import { useCallback, useEffect, useMemo, useState } from "react"
import { checkSettings, type BotSettings, type Lang, type SettingsIssue } from "@apex/db/bot-settings"
import type { BotJson } from "@/lib/bot"
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

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; blurb: string; covers: (keyof BotSettings)[] }[] = [
  { id: "general", label: "General", icon: Settings2, blurb: "Name, company and language.", covers: ["general"] },
  { id: "appearance", label: "Appearance", icon: Palette, blurb: "Colors, launcher, window and font.", covers: ["appearance"] },
  { id: "messages", label: "Messages", icon: MessageSquareText, blurb: "Greeting, suggestions and footer text.", covers: ["messages"] },
  { id: "behavior", label: "Behavior", icon: MousePointerClick, blurb: "When it opens, what it shows, where it appears.", covers: ["behavior"] },
  { id: "model", label: "AI model", icon: Cpu, blurb: "Provider, model and generation settings.", covers: ["model"] },
  { id: "persona", label: "Persona", icon: Sparkles, blurb: "Tone, instructions and answer rules.", covers: ["persona"] },
  { id: "handoff", label: "Hand-off & leads", icon: LifeBuoy, blurb: "Human hand-off and contact capture.", covers: ["handoff"] },
  { id: "install", label: "Install & security", icon: Code2, blurb: "Embed code, allowed sites and limits.", covers: ["security"] },
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
  const [bot, setBot] = useState(initial)
  const [draft, setDraft] = useState<BotSettings>(initial.settings)
  const [section, setSection] = useState<SectionId>(() => SECTIONS.find((s) => s.id === initialSection)?.id ?? "general")
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
  const localIssues = useMemo(() => checkSettings(draft), [draft])
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
      setSave({ kind: "error", message: `Fix ${localIssues.length === 1 ? "1 setting" : `${localIssues.length} settings`} before saving` })
      return
    }
    setSave({ kind: "saving" })
    try {
      const res = await fetch("/api/bot", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: draft, version: bot.version }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setBot(body)
        setDraft(body.settings)
        setShowIssues(false)
        setSave({ kind: "saved" })
        return
      }
      if (body.error === "invalid_settings") {
        setServerIssues(body.issues)
        setShowIssues(true)
      }
      setSave({ kind: "error", message: body.message ?? "Couldn't save. Try again" })
    } catch {
      setSave({ kind: "error", message: "You're offline. Check your connection and try again" })
    }
  }, [dirty, save.kind, bot, draft, localIssues])

  const discard = () => {
    setDraft(bot.settings)
    setServerIssues(null)
    setShowIssues(false)
    setSave({ kind: "idle" })
  }

  const rotate = async () => {
    const res = await fetch("/api/bot/site-key", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSave({ kind: "error", message: body.message ?? "Couldn't rotate the key" })
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
  const current = SECTIONS.find((s) => s.id === section)!

  const status =
    save.kind === "saving" ? (
      <span className="flex items-center gap-1.5">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Saving…
      </span>
    ) : save.kind === "error" ? (
      <span className="text-red-500">{save.message}</span>
    ) : dirty ? (
      "Unsaved changes"
    ) : save.kind === "saved" ? (
      "All changes saved. Live on your site within a minute."
    ) : (
      `Last saved ${new Date(bot.updatedAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}`
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
          <h1 className="text-lg font-semibold">Customize widget</h1>
          <p role="status" aria-live="polite" className="truncate text-xs text-[var(--color-muted)]">
            {bot.canEdit ? status : "View only. Ask a workspace owner or admin to make changes."}
          </p>
        </div>
        <div role="radiogroup" aria-label="Editing language" className="flex rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
          {(["tr", "en"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} className={pill(lang === l)}>
              {l === "tr" ? "Türkçe" : "English"}
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
            Discard
          </button>
          <button
            type="button"
            onClick={() => void doSave()}
            disabled={!dirty || save.kind === "saving" || !bot.canEdit}
            data-tour="save"
            title="Save (⌘S)"
            className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {save.kind === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[13rem_minmax(0,1fr)_minmax(24rem,30rem)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
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
                    <span className="flex-1">{label}</span>
                    {n > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[0.6875rem] font-semibold text-white" aria-label={`${n} to fix`}>
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
            {section === "handoff" && <HandoffSection {...props} />}
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

        <aside aria-label="Live preview" className="flex flex-col gap-3 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-24 2xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Live preview</h2>
            <div className="flex flex-wrap gap-1">
              <div className="flex rounded-lg border border-[var(--color-line)] p-0.5" role="radiogroup" aria-label="Preview screen">
                <button type="button" role="radio" aria-checked={device === "desktop"} aria-label="Desktop" onClick={() => setDevice("desktop")} className={pill(device === "desktop")}>
                  <Monitor className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" role="radio" aria-checked={device === "mobile"} aria-label="Phone" onClick={() => setDevice("mobile")} className={pill(device === "mobile")}>
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <div className="flex rounded-lg border border-[var(--color-line)] p-0.5" role="radiogroup" aria-label="Preview content">
                {(
                  [
                    ["welcome", "Welcome"],
                    ["conversation", "Chat"],
                    ...(draft.handoff.leadCapture === "before-chat" ? [["lead", "Lead form"]] : []),
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
                  Closed
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
            Showing the {lang === "tr" ? "Turkish" : "English"} version
            {draft.appearance.theme === "auto" ? `, in ${systemDark ? "dark" : "light"} mode like your device` : ""}. Click the launcher to open and close it.
          </p>
        </aside>
      </div>
    </div>
  )
}
