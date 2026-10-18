"use client"

import { Search } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { field } from "./detail-ui"

// Finds a workspace by name or owner email through the workspace list (/api/admin/workspaces), for
// the forms that target workspaces: feature flags and announcements.

export interface PickedWorkspace {
  id: string
  name: string
  plan: string
}

interface Row extends PickedWorkspace {
  owner_email: string | null
}

const DELAY_MS = 250

export function WorkspacePicker({ onPick, exclude = [], disabled }: { onPick: (w: PickedWorkspace) => void; exclude?: string[]; disabled?: boolean }) {
  const { t: app } = useAppI18n()
  const t = app.admin!.workspacePicker
  const listId = useId()
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    const term = q.trim()
    if (!term) return setRows(null)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/admin/workspaces?q=${encodeURIComponent(term)}&limit=8`, { cache: "no-store", signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ rows: Row[] }>) : { rows: [] }))
        .then((r) => setRows(r.rows))
        .catch(() => {})
    }, DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  const shown = rows?.filter((r) => !exclude.includes(r.id)) ?? null
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
      <input
        type="search"
        value={q}
        disabled={disabled}
        maxLength={200}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.placeholder}
        aria-label={t.placeholder}
        aria-controls={listId}
        aria-expanded={!!shown}
        role="combobox"
        className={`${field} h-9 w-full pl-9`}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {!shown.length && <li className="px-3 py-2 text-sm text-[var(--color-muted)]">{t.none}</li>}
          {shown.map((w) => (
            <li key={w.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onPick({ id: w.id, name: w.name, plan: w.plan })
                  setQ("")
                }}
                className="flex w-full cursor-pointer flex-col rounded-md border-0 bg-transparent px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-bubble)]"
              >
                <span className="font-medium">{w.name}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {w.plan}
                  {w.owner_email && ` · ${w.owner_email}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
