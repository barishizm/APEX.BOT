"use client"

import { CircleCheck, FileUp, Globe, LoaderCircle, Paperclip, Type } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ErrorText, TextArea, TextInput } from "@/components/widget-studio/fields"
import { format } from "@/lib/i18n"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"
import { primaryButton, segment, segmented, useSend, type Limits } from "./shared"

type Tab = "website" | "text" | "file"
const FILE_TYPES = /\.(pdf|docx|txt|md|markdown|csv)$/i
const FILE_ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"

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
  const { t: app } = useAppI18n()
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
  const [addingText, setAddingText] = useState(false)

  const [fileError, setFileError] = useState<string | undefined>()
  const [uploading, setUploading] = useState<string | null>(null)
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

  // the server reads the file (PDF and Word need it) and stores the text as a source of its own
  const upload = async (file: File | undefined) => {
    setFileError(undefined)
    if (!file) return
    if (!FILE_TYPES.test(file.name)) return setFileError(t.fileType)
    if (file.size > limits.fileBytes) return setFileError(format(t.fileTooLarge, { n: limits.fileBytes / 1_000_000 }))
    setUploading(file.name)
    const form = new FormData()
    form.append("file", file)
    let result: { ok: boolean; data: { message?: string; source?: SourceJson } }
    try {
      const res = await fetch("/api/knowledge", { method: "POST", body: form })
      result = { ok: res.ok, data: await res.json().catch(() => ({})) }
    } catch {
      result = { ok: false, data: { message: k.offline } }
    }
    setUploading(null)
    if (!result.ok || !result.data.source) return setFileError(result.data.message ?? t.fileFailed)
    onAdded(result.data.source)
    setDone(t.added)
  }

  const tabs: [Tab, string, typeof Globe][] = [
    ["website", t.website, Globe],
    ["text", t.text, Type],
    ["file", t.file, Paperclip],
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
          <p className="text-sm text-[var(--color-muted)]">{format(k.website.description, { plan: k.plans[limits.plan], n: limits.websitePages, docs: Math.min(limits.websiteDocuments, limits.websitePages) })}</p>
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
      ) : tab === "text" ? (
        <form id="add-panel-text" role="tabpanel" aria-labelledby="add-tab-text" onSubmit={addText} className="flex flex-col gap-3">
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
          <button type="submit" disabled={addingText || full || !title.trim() || !content.trim()} className={primaryButton}>
            {addingText && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {addingText ? k.text.adding : k.text.add}
          </button>
        </form>
      ) : (
        <div id="add-panel-file" role="tabpanel" aria-labelledby="add-tab-file" className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-muted)]">{format(t.fileDescription, { n: limits.fileBytes / 1_000_000 })}</p>
          <input
            ref={fileRef}
            type="file"
            accept={FILE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={full || uploading !== null}
            onDragOver={(e) => {
              if (full || uploading || !e.dataTransfer.types.includes("Files")) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!full && !uploading) upload(e.dataTransfer.files[0])
            }}
            className={cn(
              "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-line)] bg-transparent p-6 text-center text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-60",
              dragging && "border-[var(--color-secondary)] bg-[var(--color-secondary)]/5",
            )}
          >
            {uploading ? <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden /> : <FileUp className="h-6 w-6 text-[var(--color-muted)]" aria-hidden />}
            <span className="text-sm font-semibold">{uploading ? format(t.uploading, { name: uploading }) : dragging ? t.drop : t.choose}</span>
            {!uploading && <span className="text-xs text-[var(--color-muted)]">{t.fileHint}</span>}
          </button>
          {fileError && <ErrorText>{fileError}</ErrorText>}
        </div>
      )}
      {full && <p className="text-xs text-[var(--color-muted)]">{format(k.full, { n: limits.sources })}</p>}
    </section>
  )
}
