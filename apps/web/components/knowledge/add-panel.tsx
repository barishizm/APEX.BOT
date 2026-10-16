"use client"

import { CircleCheck, FileUp, Globe, LoaderCircle, Type } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ErrorText, TextArea, TextInput } from "@/components/widget-studio/fields"
import { format } from "@/lib/i18n"
import { formatNumber } from "@/lib/i18n/format"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"
import { primaryButton, segment, segmented, useSend, type Limits } from "./shared"

type Tab = "website" | "text"
const FILE_TYPES = /\.(txt|md|markdown|csv)$/i

export function AddPanel({
  limits,
  full,
  prefillTitle,
  onAdded,
  onNotice,
}: {
  limits: Limits
  full: boolean
  /** From a conversation's "Add an answer": the question to answer. */
  prefillTitle?: string
  onAdded: (s: SourceJson) => void
  onNotice: (message: string) => void
}) {
  const { t: app, locale } = useAppI18n()
  const k = app.knowledge
  const t = k.add
  const send = useSend()
  const [tab, setTab] = useState<Tab>(prefillTitle ? "text" : "website")
  const [done, setDone] = useState<string | null>(null)

  const [url, setUrl] = useState("")
  const [urlError, setUrlError] = useState<string | undefined>()
  const [addingSite, setAddingSite] = useState(false)

  const [title, setTitle] = useState(prefillTitle ?? "")
  const [content, setContent] = useState("")
  const [textError, setTextError] = useState<string | undefined>()
  const [fileError, setFileError] = useState<string | undefined>()
  const [addingText, setAddingText] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  // arriving to answer a question: bring the form into view, ready to type the answer
  useEffect(() => {
    if (!prefillTitle) return
    panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    panelRef.current?.querySelector("textarea")?.focus({ preventScroll: true })
  }, [prefillTitle])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(null), 5000)
    return () => clearTimeout(timer)
  }, [done])

  const addSite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return setUrlError(k.website.missing)
    setAddingSite(true)
    setUrlError(undefined)
    const { ok, data } = await send("/api/knowledge", "POST", { kind: "website", url })
    setAddingSite(false)
    if (!ok) return setUrlError(data.message ?? k.website.failed)
    onAdded(data.source)
    setUrl("")
    if (data.notice) onNotice(data.notice)
    else setDone(t.reading)
  }

  const addText = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingText(true)
    setTextError(undefined)
    const { ok, data } = await send("/api/knowledge", "POST", { kind: "text", title, content })
    setAddingText(false)
    if (!ok) return setTextError(data.message ?? k.text.failed)
    onAdded(data.source)
    setTitle("")
    setContent("")
    setDone(t.added)
  }

  const importFile = async (file: File | undefined) => {
    setFileError(undefined)
    if (!file) return
    if (!FILE_TYPES.test(file.name)) return setFileError(t.importType)
    try {
      const text = (await file.text()).replace(/^﻿/, "").trim()
      if (text.length > limits.textChars) return setFileError(format(t.importTooLong, { n: formatNumber(limits.textChars, locale) }))
      setContent(text)
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, limits.title))
      setTextError(undefined)
    } catch {
      setFileError(t.importFailed)
    }
  }

  const tabs: [Tab, string, typeof Globe][] = [
    ["website", t.website, Globe],
    ["text", t.text, Type],
  ]

  return (
    <section ref={panelRef} aria-labelledby="add-heading" className="flex scroll-mt-20 flex-col gap-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="add-heading" className="text-base font-semibold">
          {t.title}
        </h2>
        <div role="tablist" aria-label={t.title} className={segmented}>
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`add-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`add-panel-${key}`}
              onClick={() => setTab(key)}
              className={segment(tab === key)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {done && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-green-600/10 p-3 text-sm text-green-800 dark:text-green-300">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
          {done}
        </p>
      )}

      {tab === "website" ? (
        <form id="add-panel-website" role="tabpanel" aria-labelledby="add-tab-website" onSubmit={addSite} className="flex flex-col gap-3" noValidate>
          <p className="text-sm text-[var(--color-muted)]">{format(k.website.description, { n: limits.websitePages })}</p>
          <TextInput
            label={k.website.label}
            type="url"
            value={url}
            onChange={(v) => {
              setUrl(v)
              setUrlError(undefined)
            }}
            placeholder={k.website.placeholder}
            error={urlError}
            disabled={full}
            mono
          />
          <button type="submit" disabled={addingSite || full} className={primaryButton}>
            {addingSite && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {addingSite ? k.website.adding : k.website.add}
          </button>
        </form>
      ) : (
        <form
          id="add-panel-text"
          role="tabpanel"
          aria-labelledby="add-tab-text"
          onSubmit={addText}
          onDragOver={(e) => {
            if (full || !e.dataTransfer.types.includes("Files")) return
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={(e) => {
            if (full) return
            e.preventDefault()
            setDragging(false)
            importFile(e.dataTransfer.files[0])
          }}
          className={cn("relative flex flex-col gap-3 rounded-xl", dragging && "outline-2 outline-offset-4 outline-[var(--color-secondary)] outline-dashed")}
        >
          <p className="text-sm text-[var(--color-muted)]">{prefillTitle ? t.answering : k.text.description}</p>
          <TextInput label={k.text.titleLabel} value={title} onChange={setTitle} max={limits.title} placeholder={k.text.titlePlaceholder} disabled={full} />
          <TextArea
            label={k.text.content}
            rows={8}
            value={content}
            onChange={(v) => {
              setContent(v)
              setTextError(undefined)
            }}
            max={limits.textChars}
            placeholder={k.text.contentPlaceholder}
            error={textError}
            disabled={full}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => {
              importFile(e.target.files?.[0])
              e.target.value = ""
            }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={full}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-[var(--color-line)] bg-transparent px-2.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden />
              {t.import}
            </button>
            <span className="text-xs text-[var(--color-muted)]">{t.importHint}</span>
          </div>
          {fileError && <ErrorText>{fileError}</ErrorText>}
          <button type="submit" disabled={addingText || full || !title.trim() || !content.trim()} className={primaryButton}>
            {addingText && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {addingText ? k.text.adding : k.text.add}
          </button>
          {dragging && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-[var(--color-surface)]/85 text-sm font-semibold">{t.drop}</div>
          )}
        </form>
      )}
      {full && <p className="text-xs text-[var(--color-muted)]">{format(k.full, { n: limits.sources })}</p>}
    </section>
  )
}
