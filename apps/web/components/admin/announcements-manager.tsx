"use client"

import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import type { Announcement, AnnouncementAudience, AnnouncementLevel, AnnouncementLocale } from "@apex/db"
import { AnnouncementBanners } from "@/components/announcement-banner"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { ConfirmDialog, Empty, Section, button, card, dangerButton, field, fill, postJson, primaryButton, tag, type Jsonify } from "./detail-ui"
import { WorkspacePicker, type PickedWorkspace } from "./workspace-picker"

// /admin/announcements: the list, and the editor for one. Writes go through the confirm dialog
// (a reason) to /api/admin/announcements; the page then reloads its data.

export type AnnouncementJson = Jsonify<Announcement>

// announcements.ts's lists; @apex/db itself stays out of the browser bundle
const LEVELS: AnnouncementLevel[] = ["info", "warn", "critical"]
const AUDIENCES: AnnouncementAudience[] = ["all", "plan", "workspace"]
const LOCALES: AnnouncementLocale[] = ["en", "tr", "lt", "lv", "et"]
const PLANS = ["free", "starter", "pro", "business"] as const
const MAX_MESSAGE = 500

const LEVEL_TONE: Record<AnnouncementLevel, string> = {
  info: "bg-[var(--color-bubble)] text-[var(--color-text)]",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300",
}
const STATUS_TONE = {
  scheduled: "border border-[var(--color-line)] text-[var(--color-muted)]",
  active: "bg-green-500/15 text-green-800 dark:text-green-200",
  ended: "bg-[var(--color-bubble)] text-[var(--color-muted)]",
} as const

function statusOf(a: AnnouncementJson, now: number) {
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return "ended" as const
  return new Date(a.startsAt).getTime() > now ? ("scheduled" as const) : ("active" as const)
}

// <input type="datetime-local"> works in the browser's time zone, without one in the value
const pad = (n: number) => String(n).padStart(2, "0")
function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

interface Draft {
  level: AnnouncementLevel
  message: Record<AnnouncementLocale, string>
  startsAt: string
  endsAt: string
  audience: AnnouncementAudience
  plans: string[]
  workspaces: PickedWorkspace[]
  marketing: boolean
  dismissible: boolean
}

const emptyDraft = (): Draft => ({
  level: "info",
  message: { en: "", tr: "", lt: "", lv: "", et: "" },
  startsAt: "",
  endsAt: "",
  audience: "all",
  plans: [],
  workspaces: [],
  marketing: false,
  dismissible: true,
})

function draftOf(a: AnnouncementJson, workspaces: Record<string, { name: string; plan: string }>): Draft {
  return {
    level: a.level,
    message: { ...emptyDraft().message, ...a.message },
    startsAt: toLocalInput(a.startsAt),
    endsAt: toLocalInput(a.endsAt),
    audience: a.audience,
    plans: a.plans,
    workspaces: a.organizationIds.map((id) => ({ id, name: workspaces[id]?.name ?? id, plan: workspaces[id]?.plan ?? "" })),
    marketing: a.marketing,
    dismissible: a.dismissible,
  }
}

function payload(d: Draft) {
  return {
    level: d.level,
    message: d.message,
    startsAt: fromLocalInput(d.startsAt),
    endsAt: fromLocalInput(d.endsAt),
    audience: d.audience,
    plans: d.audience === "plan" ? d.plans : [],
    organizationIds: d.audience === "workspace" ? d.workspaces.map((w) => w.id) : [],
    marketing: d.audience === "all" && d.marketing,
    dismissible: d.dismissible,
  }
}

type Pending = { kind: "save"; id: string | null; draft: Draft } | { kind: "end" | "delete"; id: string }

export function AnnouncementsManager({
  announcements,
  workspaces,
  canEdit,
}: {
  announcements: AnnouncementJson[]
  workspaces: Record<string, { name: string; plan: string }>
  canEdit: boolean
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.announcements
  const router = useRouter()
  // null: the list; otherwise the editor, for a new announcement (id null) or an existing one
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const now = Date.now()
  const when = (iso: string) => formatDate(iso, locale, { dateStyle: "medium", timeStyle: "short" })

  const audienceText = (a: AnnouncementJson) =>
    a.audience === "all"
      ? t.audiences.all
      : a.audience === "plan"
        ? `${t.audiences.plan}: ${a.plans.map((p) => t.plans[p]).join(", ")}`
        : `${t.audiences.workspace}: ${a.organizationIds.map((id) => workspaces[id]?.name ?? id).join(", ")}`

  const dialog = (() => {
    if (!pending) return null
    if (pending.kind === "save") {
      return {
        title: pending.id ? t.editor.confirmUpdate : t.editor.confirmCreate,
        text: t.editor.confirmText,
        submit: (reason: string) =>
          postJson(pending.id ? `/api/admin/announcements/${pending.id}/update` : "/api/admin/announcements", { ...payload(pending.draft), reason }),
      }
    }
    return {
      title: pending.kind === "end" ? t.confirmEnd : t.confirmDelete,
      text: pending.kind === "end" ? t.confirmEndText : t.confirmDeleteText,
      danger: pending.kind === "delete",
      submit: (reason: string) => postJson(`/api/admin/announcements/${pending.id}/${pending.kind}`, { reason }),
    }
  })()

  return (
    <div className="flex flex-col gap-6">
      {canEdit && !editing && (
        <div>
          <button type="button" onClick={() => setEditing({ id: null, draft: emptyDraft() })} className={cn(button, primaryButton)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t.new}
          </button>
        </div>
      )}

      {editing && (
        <Editor
          key={editing.id ?? "new"}
          initial={editing.draft}
          isNew={!editing.id}
          onCancel={() => setEditing(null)}
          onSave={(draft) => setPending({ kind: "save", id: editing.id, draft })}
        />
      )}

      {!announcements.length ? (
        <Empty>{t.empty}</Empty>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {announcements.map((a) => {
            const status = statusOf(a, now)
            return (
              <li key={a.id} className={card}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(tag, STATUS_TONE[status])}>{t.statuses[status]}</span>
                  <span className={cn(tag, LEVEL_TONE[a.level])}>{t.levels[a.level]}</span>
                  <span className="text-sm text-[var(--color-muted)]">{audienceText(a)}</span>
                  {a.marketing && <span className={cn(tag, "bg-[var(--color-bubble)] text-[var(--color-text)]")}>{t.website}</span>}
                  {!a.dismissible && <span className={cn(tag, "bg-[var(--color-bubble)] text-[var(--color-text)]")}>{t.notDismissible}</span>}
                </div>
                <p className="m-0 text-sm font-medium">{a.message[locale as AnnouncementLocale] ?? a.message.en}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
                  <span>
                    {a.endsAt
                      ? fill(t.window.range, { start: when(a.startsAt), end: when(a.endsAt) })
                      : `${fill(t.window.from, { start: when(a.startsAt) })} · ${t.window.untilEnded}`}
                  </span>
                  {canEdit && (
                    <span className="ml-auto flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEditing({ id: a.id, draft: draftOf(a, workspaces) })} className={button}>
                        {t.edit}
                      </button>
                      {status === "active" && (
                        <button type="button" onClick={() => setPending({ kind: "end", id: a.id })} className={button}>
                          {t.end}
                        </button>
                      )}
                      <button type="button" onClick={() => setPending({ kind: "delete", id: a.id })} className={cn(button, dangerButton)}>
                        {t.delete}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pending && dialog && (
        <ConfirmDialog
          title={dialog.title}
          text={dialog.text}
          danger={"danger" in dialog && dialog.danger}
          stepUp={false}
          submit={dialog.submit}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null)
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Editor({ initial, isNew, onCancel, onSave }: { initial: Draft; isNew: boolean; onCancel: () => void; onSave: (d: Draft) => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.announcements
  const e = t.editor
  const [d, setD] = useState<Draft>(initial)
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const ready =
    !!d.message.en.trim() &&
    (d.audience !== "plan" || d.plans.length > 0) &&
    (d.audience !== "workspace" || d.workspaces.length > 0) &&
    (!d.endsAt || !d.startsAt || new Date(d.endsAt) > new Date(d.startsAt))

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (ready) onSave(d)
  }

  const label = "flex flex-col gap-1.5 text-sm font-medium"
  const hint = "text-xs font-normal text-[var(--color-muted)]"
  const preview = d.message[locale as AnnouncementLocale]?.trim() || d.message.en.trim()

  return (
    <form onSubmit={submit}>
      <Section title={isNew ? e.createTitle : e.editTitle}>
        <label className={cn(label, "sm:max-w-xs")}>
          {e.level}
          <select value={d.level} onChange={(ev) => set({ level: ev.target.value as AnnouncementLevel })} className={`${field} h-9`}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t.levels[l]}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{e.message}</legend>
          <span className={hint}>{e.messageHint}</span>
          {LOCALES.map((l) => (
            <label key={l} className={label}>
              <span>
                {e.languages[l]}
                {l === "en" && " *"}
              </span>
              <textarea
                value={d.message[l]}
                required={l === "en"}
                maxLength={MAX_MESSAGE}
                rows={2}
                onChange={(ev) => set({ message: { ...d.message, [l]: ev.target.value } })}
                className={`${field} resize-y py-2`}
              />
            </label>
          ))}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            {e.startsAt}
            <input type="datetime-local" value={d.startsAt} onChange={(ev) => set({ startsAt: ev.target.value })} className={`${field} h-9`} />
            <span className={hint}>{e.startsHint}</span>
          </label>
          <label className={label}>
            {e.endsAt}
            <input type="datetime-local" value={d.endsAt} onChange={(ev) => set({ endsAt: ev.target.value })} className={`${field} h-9`} />
            <span className={hint}>{e.endsHint}</span>
          </label>
        </div>
        <span className={hint}>{fill(e.timeZone, { zone })}</span>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{e.audience}</legend>
          <div className="flex flex-wrap gap-4">
            {AUDIENCES.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="audience" checked={d.audience === a} onChange={() => set({ audience: a })} className="accent-[var(--color-text)]" />
                {t.audiences[a]}
              </label>
            ))}
          </div>
          {d.audience === "plan" && (
            <div className="flex flex-wrap gap-4" role="group" aria-label={e.choosePlans}>
              {PLANS.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.plans.includes(p)}
                    onChange={(ev) => set({ plans: ev.target.checked ? [...d.plans, p] : d.plans.filter((x) => x !== p) })}
                    className="accent-[var(--color-text)]"
                  />
                  {t.plans[p]}
                </label>
              ))}
            </div>
          )}
          {d.audience === "workspace" && (
            <div className="flex flex-col gap-2" role="group" aria-label={e.chooseWorkspaces}>
              {!!d.workspaces.length && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {d.workspaces.map((w) => (
                    <li key={w.id} className={cn(tag, "gap-1 bg-[var(--color-bubble)] py-1 text-[var(--color-text)]")}>
                      {w.name}
                      <button
                        type="button"
                        aria-label={fill(app.admin!.workspacePicker.remove, { name: w.name })}
                        onClick={() => set({ workspaces: d.workspaces.filter((x) => x.id !== w.id) })}
                        className="flex cursor-pointer items-center border-0 bg-transparent p-0 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="sm:max-w-md">
                <WorkspacePicker exclude={d.workspaces.map((w) => w.id)} onPick={(w) => set({ workspaces: [...d.workspaces, w] })} />
              </div>
            </div>
          )}
        </fieldset>

        <label className={cn("flex items-start gap-2 text-sm", d.audience !== "all" && "opacity-50")}>
          <input
            type="checkbox"
            checked={d.audience === "all" && d.marketing}
            disabled={d.audience !== "all"}
            onChange={(ev) => set({ marketing: ev.target.checked })}
            className="mt-0.5 accent-[var(--color-text)]"
          />
          <span className="flex flex-col">
            {e.marketing}
            <span className={hint}>{e.marketingHint}</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.dismissible} onChange={(ev) => set({ dismissible: ev.target.checked })} className="accent-[var(--color-text)]" />
          {e.dismissible}
        </label>

        {preview && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{e.preview}</span>
            <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
              <AnnouncementBanners items={[{ id: "preview", level: d.level, text: preview, dismissible: false, version: "" }]} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={button}>
            {e.cancel}
          </button>
          <button type="submit" disabled={!ready} className={cn(button, primaryButton)}>
            {e.save}
          </button>
        </div>
      </Section>
    </form>
  )
}
