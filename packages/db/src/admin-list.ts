import type { Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"

// Server-side lists for the admin area: search, whitelisted filters, sorting and keyset (cursor)
// pagination over any table. Every list is described by a ListSpec; nothing the client sends ever
// becomes SQL, only values bound as parameters or keys looked up in the spec.

/** Postgres types a sort value or the row id can have; the cursor value is cast back to it. */
export type ListValueType = "text" | "uuid" | "timestamptz" | "bigint" | "int" | "boolean"
export type SortDir = "asc" | "desc"

export interface ListSpec {
  /** Columns to return, e.g. "u.id, u.email". */
  select: string
  /** Table and joins, e.g. "app.users u". */
  from: string
  /** A condition every row must meet, e.g. "o.deleted_at is null". */
  where?: string
  /** Unique, non-null expression that breaks ties between equal sort values. */
  id: { sql: string; type: ListValueType }
  /** Sortable keys. Each expression must never be null (wrap nullable columns in coalesce). */
  sorts: Record<string, { sql: string; type: ListValueType }>
  defaultSort: { key: string; dir: SortDir }
  /** Expressions the search box matches (case-insensitive substring). */
  search?: string[]
  /** Filter key → allowed value → SQL condition. Only these exact values are accepted. */
  filters?: Record<string, Record<string, string>>
}

export interface ListParams {
  q?: string | null
  sort?: string | null
  dir?: string | null
  filters?: Record<string, string | null | undefined>
  cursor?: string | null
  limit?: number | null
}

export interface ListPage<T> {
  rows: T[]
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null
}

export const LIST_DEFAULT_LIMIT = 25
export const LIST_MAX_LIMIT = 100
const MAX_QUERY = 200

const invalid = (message: string) => new AdminError("invalid_input", message)

// \ % _ are LIKE wildcards; escaped so the search is a plain substring match
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

interface Cursor {
  sort: string
  dir: SortDir
  value: string
  id: string
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.sort, c.dir, c.value, c.id])).toString("base64url")
}

function decodeCursor(raw: string): Cursor {
  try {
    const [sort, dir, value, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown[]
    if (typeof sort === "string" && (dir === "asc" || dir === "desc") && typeof value === "string" && typeof id === "string") {
      return { sort, dir, value, id }
    }
  } catch {}
  throw invalid("This page link is out of date. Go back to the first page")
}

interface Resolved {
  sortKey: string
  dir: SortDir
  where: string[]
  params: unknown[]
}

/** Validates the params against the spec and builds the shared where clause. */
function resolve(spec: ListSpec, input: ListParams): Resolved {
  const sortKey = input.sort || spec.defaultSort.key
  if (!spec.sorts[sortKey]) throw invalid("This list can't be sorted that way")
  if (input.dir && input.dir !== "asc" && input.dir !== "desc") throw invalid("This list can't be sorted that way")
  const dir: SortDir = (input.dir as SortDir | null | undefined) || (sortKey === spec.defaultSort.key ? spec.defaultSort.dir : "asc")

  const where: string[] = spec.where ? [`(${spec.where})`] : []
  const params: unknown[] = []

  const q = input.q?.trim() ?? ""
  if (q.length > MAX_QUERY) throw invalid("The search can be at most 200 characters")
  if (q && spec.search?.length) {
    params.push(likePattern(q))
    where.push(`(${spec.search.map((s) => `${s} ilike $${params.length}`).join(" or ")})`)
  }

  for (const [key, value] of Object.entries(input.filters ?? {})) {
    if (value === undefined || value === null || value === "") continue
    const condition = spec.filters?.[key]?.[value]
    if (!condition) throw invalid("Unknown filter")
    where.push(`(${condition})`)
  }

  return { sortKey, dir, where, params }
}

function buildQuery(spec: ListSpec, r: Resolved, cursor: Cursor | null, limit: number) {
  const sort = spec.sorts[r.sortKey]!
  const where = [...r.where]
  const params = [...r.params]
  if (cursor) {
    params.push(cursor.value, cursor.id)
    // row comparison: both columns run in the same direction, so one comparison covers ties
    where.push(`(${sort.sql}, ${spec.id.sql}) ${r.dir === "asc" ? ">" : "<"} ($${params.length - 1}::${sort.type}, $${params.length}::${spec.id.type})`)
  }
  params.push(limit)
  // the sort value goes out as text so the cursor keeps full precision (timestamps have microseconds)
  const text = `select ${spec.select}, (${sort.sql})::text as "__sort", (${spec.id.sql})::text as "__id"
    from ${spec.from}
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by ${sort.sql} ${r.dir}, ${spec.id.sql} ${r.dir}
    limit $${params.length}`
  return { text, params }
}

function strip<T>(row: Record<string, unknown>): T {
  const { __sort: _s, __id: _i, ...rest } = row
  return rest as T
}

/** One page of the list. Rows come back as the driver returns them (Dates stay Dates). */
export async function listPage<T = Record<string, unknown>>(q: Queryable, spec: ListSpec, input: ListParams = {}): Promise<ListPage<T>> {
  const r = resolve(spec, input)
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? LIST_DEFAULT_LIMIT) || LIST_DEFAULT_LIMIT, 1), LIST_MAX_LIMIT)
  const cursor = input.cursor ? decodeCursor(input.cursor) : null
  // a cursor from another sort order would skip or repeat rows
  if (cursor && (cursor.sort !== r.sortKey || cursor.dir !== r.dir)) throw invalid("This page link is out of date. Go back to the first page")

  const { text, params } = buildQuery(spec, r, cursor, limit + 1)
  const { rows } = await q.query<Record<string, unknown>>(text, params)
  const more = rows.length > limit
  const page = more ? rows.slice(0, limit) : rows
  const last = page.at(-1)
  return {
    rows: page.map((row) => strip<T>(row)),
    nextCursor: more && last ? encodeCursor({ sort: r.sortKey, dir: r.dir, value: String(last.__sort), id: String(last.__id) }) : null,
  }
}

/**
 * Every matching row in list order, up to `max`, for exports. `truncated` says rows were left out.
 * The cursor in `input` is ignored: an export always starts from the top.
 */
export async function listAll<T = Record<string, unknown>>(
  q: Queryable,
  spec: ListSpec,
  input: ListParams = {},
  max = 10_000,
): Promise<{ rows: T[]; truncated: boolean }> {
  const r = resolve(spec, input)
  const { text, params } = buildQuery(spec, r, null, max + 1)
  const { rows } = await q.query<Record<string, unknown>>(text, params)
  return { rows: rows.slice(0, max).map((row) => strip<T>(row)), truncated: rows.length > max }
}
