// A data table's state as it appears in the page URL. Plain module, so server pages can read the
// URL they were opened with and hand it to the table (layouts can't read search params).

export type SortDir = "asc" | "desc"

export interface TableQuery {
  q: string
  sort: string | null
  dir: SortDir | null
  filters: Record<string, string>
  cursor: string | null
}

type SearchParams = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

/** Reads q, sort, dir, cursor and the given filter keys from a page's searchParams. */
export function readTableQuery(search: SearchParams, filterKeys: readonly string[] = []): TableQuery {
  const dir = one(search.dir)
  return {
    q: one(search.q).slice(0, 200),
    sort: one(search.sort) || null,
    dir: dir === "asc" || dir === "desc" ? dir : null,
    filters: Object.fromEntries(filterKeys.map((k) => [k, one(search[k])]).filter(([, v]) => v)),
    cursor: one(search.cursor) || null,
  }
}

/** The query string for a table state; empty values are left out. */
export function tableQueryString(query: TableQuery, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  if (query.q.trim()) params.set("q", query.q.trim())
  if (query.sort) params.set("sort", query.sort)
  if (query.dir) params.set("dir", query.dir)
  for (const [k, v] of Object.entries(query.filters)) if (v) params.set(k, v)
  if (query.cursor) params.set("cursor", query.cursor)
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  return params.toString()
}
