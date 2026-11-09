"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { SitesJson } from "@/lib/bot"
import { format } from "@/lib/i18n"
import { UpgradeNote } from "@/components/plan/upgrade-note"
import { chooseActiveSites, createSite, removeSite, renameSite, selectSite } from "./api"

type Site = SitesJson["sites"][number]

const card = "flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
const input = "h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)]"
const primary =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
const secondary =
  "inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
const danger =
  "inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-[var(--color-danger-solid)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const errorText = "m-0 text-sm text-[var(--color-danger)]"

export function SitesManager({ initial }: { initial: SitesJson }) {
  const { t: app } = useAppI18n()
  const t = app.sites
  const router = useRouter()
  const [sites, setSites] = useState(initial.sites)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const full = sites.length >= initial.limit
  // the plan, not the platform, sets the limit: the way out is a bigger plan
  const planLimited = !!initial.plan.entitlements && initial.plan.plan !== "business"

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const res = await createSite(name, t)
    if (res.ok) return window.location.assign("/dashboard")
    setBusy(false)
    setMessage(res.message)
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <h1 className="m-0 text-lg font-semibold">{t.title}</h1>
        <p className="m-0 text-xs text-[var(--color-muted)]">{t.intro}</p>
      </header>

      <div className="flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">

        {initial.canEdit && sites.some((s) => s.paused) && <ChooseActive sites={sites} limit={initial.limit} />}

        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              current={site.id === initial.currentId}
              canEdit={initial.canEdit}
              onlyOne={sites.length === 1}
              nameMax={initial.nameMax}
              onRenamed={(next) => {
                setSites((all) => all.map((s) => (s.id === site.id ? { ...s, name: next } : s)))
                // the header's switcher is server-rendered
                router.refresh()
              }}
              onRemoved={() => {
                // the dashboard was showing it: load whichever site the server falls back to
                if (site.id === initial.currentId) return window.location.reload()
                setSites((all) => all.filter((s) => s.id !== site.id))
                router.refresh()
              }}
            />
          ))}
        </ul>

        {initial.canEdit ? (
          <section className={card} aria-labelledby="add-site">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="add-site" className="m-0 text-lg font-semibold">
                {t.add.title}
              </h2>
              <span className="text-sm text-[var(--color-muted)]">{format(t.count, { count: sites.length, limit: initial.limit })}</span>
            </div>
            {full && planLimited ? (
              <UpgradeNote upgrade={t.plan.upgrade}>{format(t.plan.planLimit, { limit: initial.limit })}</UpgradeNote>
            ) : full ? (
              <p className="m-0 text-sm text-[var(--color-muted)]">{format(t.add.limit, { limit: initial.limit })}</p>
            ) : (
              <form onSubmit={add} className="flex flex-col gap-2">
                <label htmlFor="site-name" className="text-sm font-medium">
                  {t.add.label}
                </label>
                <div className="flex gap-2 max-sm:flex-col">
                  <input id="site-name" value={name} maxLength={initial.nameMax} onChange={(e) => setName(e.target.value)} placeholder={t.add.placeholder} className={input} />
                  <button type="submit" disabled={busy || !name.trim()} className={primary}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {t.add.submit}
                  </button>
                </div>
                <p className="m-0 text-xs text-[var(--color-muted)]">{t.add.hint}</p>
                {message && (
                  <p role="alert" className={errorText}>
                    {message}
                  </p>
                )}
              </form>
            )}
          </section>
        ) : (
          <p className="m-0 text-sm text-[var(--color-muted)]">{t.readOnly}</p>
        )}
      </div>
    </div>
  )
}

function SiteRow({
  site,
  current,
  canEdit,
  onlyOne,
  nameMax,
  onRenamed,
  onRemoved,
}: {
  site: Site
  current: boolean
  canEdit: boolean
  onlyOne: boolean
  nameMax: number
  onRenamed: (name: string) => void
  onRemoved: () => void
}) {
  const { t: app } = useAppI18n()
  const t = app.sites
  const [mode, setMode] = useState<"view" | "rename" | "remove">("view")
  const [name, setName] = useState(site.name)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (action: () => ReturnType<typeof selectSite>, done: () => void) => {
    setBusy(true)
    setMessage(null)
    const res = await action()
    setBusy(false)
    if (res.ok) done()
    else setMessage(res.message)
  }

  const open = () => run(() => selectSite(site.id, t), () => window.location.assign("/dashboard"))
  const rename = (e: FormEvent) => {
    e.preventDefault()
    run(
      () => renameSite(site.id, name, t),
      () => {
        onRenamed(name.replace(/\s+/g, " ").trim())
        setMode("view")
      },
    )
  }
  const remove = () => run(() => removeSite(site.id, t), onRemoved)

  return (
    <li className={card}>
      {mode === "rename" ? (
        <form onSubmit={rename} className="flex gap-2 max-sm:flex-col">
          <label htmlFor={`rename-${site.id}`} className="sr-only">
            {t.add.label}
          </label>
          <input id={`rename-${site.id}`} autoFocus value={name} maxLength={nameMax} onChange={(e) => setName(e.target.value)} className={input} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !name.trim()} className={primary}>
              {t.item.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(site.name)
                setMode("view")
              }}
              className={secondary}
            >
              {t.item.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 truncate text-base font-semibold">{site.name}</h2>
              {current && (
                <span className="rounded-full bg-[var(--color-bubble)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text)]">{t.item.current}</span>
              )}
              {site.paused && (
                <span title={t.plan.pausedHint} className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-xs font-semibold text-[var(--color-muted)]">
                  {t.plan.paused}
                </span>
              )}
            </div>
            {site.paused && <p className="m-0 text-sm text-[var(--color-muted)]">{t.plan.pausedHint}</p>}
            <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-[var(--color-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${site.live ? "bg-[#16a34a]" : "bg-[var(--color-line)]"}`} aria-hidden />
                {site.live ? t.item.live : t.item.notLive}
              </span>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{site.origins.length ? site.origins.map((o) => o.replace(/^https?:\/\//, "")).join(", ") : t.item.noOrigins}</span>
            </p>
          </div>
          {mode === "view" && (
            <div className="flex flex-wrap gap-2">
              {!current && (
                <button type="button" disabled={busy} onClick={open} className={secondary}>
                  {t.item.open}
                </button>
              )}
              {canEdit && (
                <>
                  <button type="button" disabled={busy} onClick={() => setMode("rename")} className={secondary}>
                    {t.item.rename}
                  </button>
                  <button
                    type="button"
                    disabled={busy || onlyOne}
                    title={onlyOne ? t.item.onlyOne : undefined}
                    onClick={() => setMode("remove")}
                    className={secondary}
                  >
                    {t.item.remove}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "remove" && (
        <div role="group" aria-label={t.item.confirmButton} className="flex flex-col gap-3 rounded-xl bg-[var(--color-bubble)] p-4">
          <p className="m-0 text-sm">{format(t.item.confirm, { name: site.name })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={remove} className={danger}>
              {t.item.confirmButton}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("view")} className={secondary}>
              {t.item.cancel}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="alert" className={errorText}>
          {message}
        </p>
      )}
    </li>
  )
}

// Over the plan's number of websites: which stay active. The rest keep everything but only offer
// the contact form until there is a free place again.
function ChooseActive({ sites, limit }: { sites: Site[]; limit: number }) {
  const { t: app } = useAppI18n()
  const t = app.sites
  const [chosen, setChosen] = useState(() => sites.filter((s) => !s.paused).map((s) => s.id))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const toggle = (id: string) => setChosen((all) => (all.includes(id) ? all.filter((x) => x !== id) : all.length < limit ? [...all, id] : all))

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const res = await chooseActiveSites(chosen, t)
    if (res.ok) return window.location.reload()
    setBusy(false)
    setMessage(res.message)
  }

  return (
    <form onSubmit={save} className={card} aria-labelledby="choose-active">
      <div className="flex flex-col gap-1">
        <h2 id="choose-active" className="m-0 text-lg font-semibold">
          {t.plan.chooseTitle}
        </h2>
        <UpgradeNote upgrade={t.plan.upgrade}>{format(t.plan.chooseIntro, { limit })}</UpgradeNote>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">{t.plan.chooseTitle}</legend>
        {sites.map((site) => (
          <label key={site.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(site.id)}
              disabled={!chosen.includes(site.id) && chosen.length >= limit}
              onChange={() => toggle(site.id)}
            />
            {site.name}
          </label>
        ))}
      </fieldset>
      <div>
        <button type="submit" disabled={busy || !chosen.length} className={primary}>
          {t.plan.chooseSave}
        </button>
      </div>
      {message && (
        <p role="alert" className={errorText}>
          {message}
        </p>
      )}
    </form>
  )
}
