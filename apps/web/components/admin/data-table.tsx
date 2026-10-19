"use client"

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, Download, RotateCw, Search, X } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatNumber, plural } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { tableQueryString, type SortDir, type TableQuery } from "./table-query"

// The admin area's list view. Everything happens on the server (lib/admin-list.ts): the table
// sends search, filters, sort and cursor to `endpoint` and shows the page it gets back. Its state
// lives in the URL, so a filtered list can be shared or reloaded. Every admin list uses this.

export interface DataTableColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** The spec's sort key for this column; leave out when it can't be sorted. */
  sortKey?: string
  /** Direction of the first click (default asc; dates read better newest first). */
  firstDir?: SortDir
  className?: string
}

export interface DataTableFilter {
  key: string
  label: string
  options: { value: string; label: string }[]
}

/** A filter that takes a typed value (the spec's valueFilters): a day, or text such as an IP address. */
export interface DataTableInput {
  key: string
  label: string
  type: "date" | "text"
  placeholder?: string
}

interface PageJson<T> {
  rows: T[]
  nextCursor: string | null
}

const SEARCH_DELAY_MS = 300

const control =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)]/60 focus-visible:border-amber-500"
const button = `${control} inline-flex cursor-pointer items-center gap-1.5 px-3 font-medium disabled:cursor-not-allowed disabled:opacity-50`

export async function errorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { message?: string } | null
  return body?.message || fallback
}

export function DataTable<T>({
  endpoint,
  label,
  columns,
  rowKey,
  rowHref,
  filters = [],
  inputs = [],
  defaultSort,
  initialQuery,
  searchPlaceholder,
  exportable = true,
  selection,
  actions,
  reloadKey = 0,
  params,
}: {
  /** The list's API route, e.g. "/api/admin/users". */
  endpoint: string
  /** Accessible name of the table. */
  label: string
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  /** Makes each row's first cell a link, e.g. to a detail page. */
  rowHref?: (row: T) => string
  filters?: DataTableFilter[]
  inputs?: DataTableInput[]
  /** Must match the spec's defaultSort, so the header shows the right arrow before any click. */
  defaultSort: { key: string; dir: SortDir }
  /** The state the page was opened with (readTableQuery on the server). */
  initialQuery?: TableQuery
  searchPlaceholder?: string
  exportable?: boolean
  /** Adds a checkbox to each row; rows are identified by rowKey. The page's actions act on the selection. */
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void }
  /** Buttons next to the export, e.g. for the selected rows. */
  actions?: ReactNode
  /** Bump to load the current page again, e.g. after an action changed rows. */
  reloadKey?: number
  /** Values the page owns rather than the table, e.g. its time range: sent with every request and kept in the URL. */
  params?: Record<string, string>
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.table

  const [query, setQuery] = useState<TableQuery>(() => initialQuery ?? { q: "", sort: null, dir: null, filters: {}, cursor: null })
  const [searchInput, setSearchInput] = useState(query.q)
  // cursors of the pages before this one, for Previous; a page opened from a link starts without them
  const [history, setHistory] = useState<(string | null)[]>([])
  const [page, setPage] = useState<PageJson<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const first = useRef(true)

  const sort = query.sort ?? defaultSort.key
  const dir = query.dir ?? (sort === defaultSort.key ? defaultSort.dir : "asc")

  // Search, filter or sort changes start over from the first page
  const update = useCallback((patch: Partial<Omit<TableQuery, "cursor">>) => {
    setQuery((q) => ({ ...q, ...patch, cursor: null }))
    setHistory([])
  }, [])

  // debounce typing into the query
  useEffect(() => {
    if (searchInput === query.q) return
    const id = setTimeout(() => update({ q: searchInput }), SEARCH_DELAY_MS)
    return () => clearTimeout(id)
  }, [searchInput, query.q, update])

  const qs = tableQueryString(query, params)

  // keep the URL in step (replace: paging through a list shouldn't fill the Back button)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname)
  }, [qs])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`${endpoint}${qs ? `?${qs}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, t.loadFailed))
        setPage((await res.json()) as PageJson<T>)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error && err.message ? err.message : t.loadFailed)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [endpoint, qs, reload, reloadKey, t.loadFailed])

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortKey) return
    const nextDir: SortDir = column.sortKey === sort ? (dir === "asc" ? "desc" : "asc") : (column.firstDir ?? "asc")
    update({ sort: column.sortKey, dir: nextDir })
  }

  function next() {
    if (!page?.nextCursor) return
    setHistory((h) => [...h, query.cursor])
    setQuery((q) => ({ ...q, cursor: page.nextCursor }))
  }

  function previous() {
    if (!history.length) return
    setQuery((q) => ({ ...q, cursor: history.at(-1) ?? null }))
    setHistory((h) => h.slice(0, -1))
  }

  function firstPage() {
    setQuery((q) => ({ ...q, cursor: null }))
    setHistory([])
  }

  async function exportCsv() {
    setExporting(true)
    setNotice(null)
    try {
      const res = await fetch(`${endpoint}?${tableQueryString({ ...query, cursor: null }, { ...params, format: "csv" })}`, { cache: "no-store" })
      if (!res.ok) throw new Error(await errorMessage(res, t.exportFailed))
      const truncated = res.headers.get("x-export-truncated")
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "export.csv"
      const url = URL.createObjectURL(await res.blob())
      const a = Object.assign(document.createElement("a"), { href: url, download: name })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (truncated) setNotice(t.exportTruncated.replace("{n}", formatNumber(Number(truncated), locale)))
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : t.exportFailed)
    } finally {
      setExporting(false)
    }
  }

  const filtered = !!query.q.trim() || Object.values(query.filters).some(Boolean)
  const rows = page?.rows ?? []
  const onFirstPage = !query.cursor
  const span = columns.length + (selection ? 1 : 0)

  // the header box selects or clears the rows on this page; rows picked on other pages stay picked
  const pageKeys = rows.map(rowKey)
  const pagePicked = selection ? pageKeys.filter((k) => selection.selected.has(k)).length : 0
  const togglePage = () => {
    if (!selection) return
    const next = new Set(selection.selected)
    for (const k of pageKeys) pagePicked === pageKeys.length ? next.delete(k) : next.add(k)
    selection.onChange(next)
  }
  const toggleRow = (key: string) => {
    if (!selection) return
    const next = new Set(selection.selected)
    if (!next.delete(key)) next.add(key)
    selection.onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 sm:max-w-sm">
          <span className="sr-only">{t.searchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
          <input
            type="search"
            value={searchInput}
            maxLength={200}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder ?? t.search}
            className={`${control} w-full pl-9 pr-3 outline-none placeholder:text-[var(--color-muted)]`}
          />
        </label>

        {filters.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span>{f.label}</span>
            <select
              value={query.filters[f.key] ?? ""}
              onChange={(e) => update({ filters: { ...query.filters, [f.key]: e.target.value } })}
              className={`${control} cursor-pointer px-2 outline-none`}
            >
              <option value="">{t.allValues}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {inputs.map((f) => (
          <FilterInput
            // a cleared or changed filter starts the field afresh
            key={`${f.key}:${query.filters[f.key] ?? ""}`}
            input={f}
            value={query.filters[f.key] ?? ""}
            onCommit={(value) => update({ filters: { ...query.filters, [f.key]: value } })}
          />
        ))}

        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}

        {exportable && (
          <button type="button" onClick={exportCsv} disabled={exporting} className={cn(button, !actions && "ml-auto")}>
            <Download className="h-4 w-4" aria-hidden />
            {exporting ? t.exporting : t.exportCsv}
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
        <table aria-label={label} aria-busy={loading} className="w-full border-collapse text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              {selection && (
                <th scope="col" className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={t.selectPage}
                    checked={!!pageKeys.length && pagePicked === pageKeys.length}
                    ref={(el) => {
                      if (el) el.indeterminate = pagePicked > 0 && pagePicked < pageKeys.length
                    }}
                    disabled={!pageKeys.length}
                    onChange={togglePage}
                    className="h-4 w-4 cursor-pointer accent-amber-500"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = c.sortKey === sort
                const Arrow = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", c.className)}
                  >
                    {c.sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        aria-label={t.sortBy.replace("{column}", c.header)}
                        className={cn(
                          "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1 py-0.5 text-xs font-semibold uppercase tracking-wide",
                          active ? "text-[var(--color-text)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
                        )}
                      >
                        {c.header}
                        <Arrow className={cn("h-3.5 w-3.5", !active && "opacity-50")} aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className={cn("transition-opacity", loading && page && "opacity-60")}>
            {!page && loading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-t border-[var(--color-line)]">
                  {selection && <td className="px-4 py-3" />}
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <span className="block h-4 w-full max-w-[10rem] animate-pulse rounded bg-[var(--color-bubble)]" />
                    </td>
                  ))}
                </tr>
              ))}
            {page &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cn("border-t border-[var(--color-line)] hover:bg-[var(--color-surface)]/60", selection?.selected.has(rowKey(row)) && "bg-amber-500/5")}
                >
                  {selection && (
                    <td className="w-10 px-4 py-3 align-middle">
                      <input
                        type="checkbox"
                        aria-label={t.selectRow}
                        checked={selection.selected.has(rowKey(row))}
                        onChange={() => toggleRow(rowKey(row))}
                        className="h-4 w-4 cursor-pointer accent-amber-500"
                      />
                    </td>
                  )}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                      {i === 0 && rowHref ? (
                        <Link href={rowHref(row)} className="text-[var(--color-text)] no-underline hover:underline">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            {page && !rows.length && !error && (
              <tr className="border-t border-[var(--color-line)]">
                <td colSpan={span} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  <p>{t.empty}</p>
                  {filtered && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput("")
                        update({ q: "", filters: {} })
                      }}
                      className={`${button} mt-3`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                      {t.clearFilters}
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <span className="flex-1">{error}</span>
          {!onFirstPage && (
            <button type="button" onClick={firstPage} className={button}>
              <ChevronsLeft className="h-4 w-4" aria-hidden />
              {t.first}
            </button>
          )}
          <button type="button" onClick={() => setReload((n) => n + 1)} className={button}>
            <RotateCw className="h-4 w-4" aria-hidden />
            {t.retry}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--color-muted)]" aria-live="polite">
          {loading ? t.loading : page ? plural(rows.length, t.pageRows, locale) : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!onFirstPage && !history.length && (
            <button type="button" onClick={firstPage} disabled={loading} className={button}>
              <ChevronsLeft className="h-4 w-4" aria-hidden />
              {t.first}
            </button>
          )}
          <button type="button" onClick={previous} disabled={loading || !history.length} className={button}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t.previous}
          </button>
          <button type="button" onClick={next} disabled={loading || !page?.nextCursor} className={button}>
            {t.next}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

// Dates apply as soon as they're picked; text when the field loses focus or on Enter, so a half-typed
// address isn't sent (and refused) on every keystroke
function FilterInput({ input, value, onCommit }: { input: DataTableInput; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = (next: string) => next.trim() !== value && onCommit(next.trim())
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
      <span>{input.label}</span>
      <input
        type={input.type === "date" ? "date" : "search"}
        value={draft}
        maxLength={200}
        placeholder={input.placeholder}
        onChange={(e) => {
          setDraft(e.target.value)
          if (input.type === "date") commit(e.target.value)
        }}
        onBlur={() => input.type === "text" && commit(draft)}
        onKeyDown={(e) => e.key === "Enter" && input.type === "text" && commit(draft)}
        className={cn(control, "px-2 outline-none placeholder:text-[var(--color-muted)]", input.type === "text" && "w-40")}
      />
    </label>
  )
}
