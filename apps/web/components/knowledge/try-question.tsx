"use client"

import { LoaderCircle, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { Group } from "@/components/widget-studio/fields"
import { format } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { primaryButton, useSend } from "./shared"

type SearchResult = { title: string; url: string; text: string; keywords: number | null; meaning: number | null; used: boolean }
type SearchResponse = {
  answered: boolean
  confidence: string
  threshold: number
  meaning: { on: boolean; embedded: number; chunks: number }
  results: SearchResult[]
}

export function TryQuestion({ disabled }: { disabled: boolean }) {
  const t = useAppI18n().t.knowledge.try
  const send = useSend()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    const { ok, data } = await send("/api/knowledge/search", "POST", { query })
    setLoading(false)
    if (ok) setResult(data)
    else setError(data.message ?? t.failed)
  }

  return (
    <Group title={t.title} description={t.description}>
      <form onSubmit={run} className="flex gap-2">
        <label htmlFor="try-question" className="sr-only">
          {t.label}
        </label>
        <input
          id="try-question"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.placeholder}
          disabled={disabled}
          maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-secondary)] disabled:opacity-60"
        />
        <button type="submit" disabled={disabled || loading || !query.trim()} className={primaryButton}>
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {t.search}
        </button>
      </form>
      {disabled && <p className="text-xs text-[var(--color-muted)]">{t.needSource}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p
            className={cn(
              "rounded-lg p-3 text-sm",
              result.answered ? "bg-green-600/10 text-green-800 dark:text-green-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            {result.answered ? (
              t.answered
            ) : result.meaning.on || result.results[0]?.keywords == null ? (
              t.nothing
            ) : (
              <>
                {format(t.belowThreshold, { score: result.results[0].keywords, threshold: result.threshold })}{" "}
                {result.confidence !== "lenient" ? (
                  <>
                    {t.lenientPre}{" "}
                    <Link href="/dashboard/widget?section=persona" className="font-semibold underline underline-offset-2">
                      {t.lenientLink}
                    </Link>{" "}
                    {t.lenientPost}
                  </>
                ) : (
                  t.addSource
                )}
              </>
            )}
          </p>
          {result.meaning.embedded > 0 && result.meaning.embedded < result.meaning.chunks && (
            <p className="text-xs text-[var(--color-muted)]">{format(t.partialMeaning, { embedded: result.meaning.embedded, chunks: result.meaning.chunks })}</p>
          )}
          {result.results.map((r, i) => (
            <article
              key={i}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3 text-sm",
                r.used ? "border-[var(--color-secondary)] bg-[var(--color-raised)]" : "border-[var(--color-line)] opacity-70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-[var(--color-text)] no-underline hover:underline">
                    {r.title}
                  </a>
                ) : (
                  <span className="truncate font-medium">{r.title}</span>
                )}
                <span className="shrink-0 font-mono text-[0.6875rem] text-[var(--color-muted)]">
                  {[
                    r.used ? t.used : null,
                    r.keywords !== null ? format(t.keywords, { score: r.keywords }) : null,
                    r.meaning !== null ? format(t.meaning, { score: Math.round(r.meaning * 100) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-[var(--color-muted)]">{r.text}</p>
            </article>
          ))}
        </div>
      )}
    </Group>
  )
}
