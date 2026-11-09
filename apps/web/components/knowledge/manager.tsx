"use client"

import { CircleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format } from "@/lib/i18n"
import { formatNumber, plural } from "@/lib/i18n/format"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"
import { AddPanel } from "./add-panel"
import { needsAttention, useSend, type Limits, type Usage } from "./shared"
import { SourceDetail } from "./source-detail"
import { SourceList, type Kind } from "./source-list"
import { TryQuestion } from "./try-question"

function Meter({ label, value, max }: { label: string; value: number; max?: number }) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge.meters
  const ratio = max ? Math.min(1, value / max) : null
  const near = ratio !== null && ratio >= 0.85
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <dt className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
        {label}
        {near && <span className="font-semibold text-[var(--color-warning)]">{t.nearFull}</span>}
      </dt>
      <dd className="m-0 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums">{formatNumber(value, locale)}</span>
        {max !== undefined && <span className="text-xs tabular-nums text-[var(--color-muted)]">{format(t.of, { max: formatNumber(max, locale) })}</span>}
      </dd>
      {ratio !== null && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bubble)]"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
        >
          <div className={cn("h-full rounded-full", near ? "bg-[var(--color-warning-solid)]" : "bg-[var(--color-secondary)]")} style={{ width: `${Math.max(ratio * 100, value ? 2 : 0)}%` }} />
        </div>
      )}
    </div>
  )
}

export function KnowledgeManager({
  initial,
  usage,
  limits,
  canEdit,
  prefillTitle,
  openSource,
}: {
  initial: SourceJson[]
  usage: Usage
  limits: Limits
  canEdit: boolean
  /** From a conversation's "Add an answer": the question to answer. */
  prefillTitle?: string
  /** ?source=<id>: the source to open on arrival. */
  openSource?: string
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge
  const send = useSend()
  const [sources, setSources] = useState(initial)
  const [notice, setNotice] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>("all")
  const [openId, setOpenId] = useState<string | null>(openSource && initial.some((s) => s.id === openSource) ? openSource : null)
  const pollRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const syncing = sources.some((s) => s.status === "syncing")
  const full = sources.length >= limits.sources
  const attention = sources.filter(needsAttention).length
  const open = sources.find((s) => s.id === openId) ?? null

  const refresh = useCallback(async () => {
    const { ok, data } = await send("/api/knowledge", "GET")
    if (ok) setSources(data.sources)
  }, [send])

  // While a website is being read, check back every few seconds
  useEffect(() => {
    if (!syncing) return
    pollRef.current = setTimeout(refresh, 2500)
    return () => clearTimeout(pollRef.current)
  }, [syncing, sources, refresh])

  // the open source is in the address, so it survives a reload and can be linked to
  useEffect(() => {
    const url = new URL(window.location.href)
    if (openId) url.searchParams.set("source", openId)
    else url.searchParams.delete("source")
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url)
  }, [openId])

  const upsert = useCallback(
    (s: SourceJson) => setSources((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list])),
    [],
  )
  const remove = useCallback((id: string) => {
    setSources((list) => list.filter((x) => x.id !== id))
    setOpenId((current) => (current === id ? null : current))
  }, [])

  const pages = sources.reduce((n, s) => n + s.pages, 0)
  const chunks = sources.reduce((n, s) => n + s.chunks, 0)

  // "Teach it your content" in the header's setup progress is server-rendered
  const router = useRouter()
  const hasKnowledge = chunks > 0
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    router.refresh()
  }, [hasKnowledge, router])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <p className="text-xs text-[var(--color-muted)]">{canEdit ? t.lede : t.viewOnly}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <dl aria-label={t.meters.label} className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
          <Meter label={t.meters.sources} value={sources.length} max={limits.sources} />
          <Meter label={t.meters.excerpts} value={chunks} max={limits.chunksPerBot} />
          <Meter label={t.meters.pages} value={pages} />
        </dl>

        {notice && (
          <p role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {notice}
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 cursor-pointer border-0 bg-transparent text-xs font-semibold text-inherit underline">
              {t.dismiss}
            </button>
          </p>
        )}
        {attention > 0 && kind !== "attention" && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{plural(attention, t.attention, locale)}</span>
            <button type="button" onClick={() => setKind("attention")} className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-inherit underline">
              {t.showThem}
            </button>
          </p>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
          <div className="flex min-w-0 flex-col gap-6">
            <SourceList
              sources={sources}
              usage={usage}
              canEdit={canEdit}
              kind={kind}
              onKind={setKind}
              onOpen={setOpenId}
              onChange={upsert}
              onRemove={remove}
              onError={setNotice}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
            {canEdit && <AddPanel limits={limits} full={full} prefillTitle={prefillTitle} onAdded={upsert} onNotice={setNotice} />}
            <TryQuestion disabled={chunks === 0} />
          </div>
        </div>
      </div>

      {open && (
        <SourceDetail
          key={open.id}
          source={open}
          replies={usage[open.id]}
          canEdit={canEdit}
          limits={limits}
          onClose={() => setOpenId(null)}
          onChange={upsert}
        />
      )}
    </div>
  )
}
