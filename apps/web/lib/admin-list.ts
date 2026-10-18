import { listAll, listPage, writeAudit, type ListParams, type ListSpec, type PlatformRole } from "@apex/db"
import { adminErrorResponse } from "@/lib/admin"
import { requestMeta, requireAdminSession } from "@/lib/auth"
import { toCsv } from "@/lib/csv"
import { db } from "@/lib/db"

// GET handlers for the admin area's lists; components/admin/data-table.tsx is their client.
//
//   GET /api/admin/<list>?q=&sort=&dir=&cursor=&limit=&<filter>=<value>       → { rows, nextCursor }
//   GET /api/admin/<list>?…&format=csv                                          → every matching row as CSV
//
// Filters are read from the query string under the spec's filter keys. Exports are written to the
// audit log, since they take personal data out of the platform.

export const CSV_EXPORT_MAX = 10_000

export interface AdminListOptions<Row> {
  /** e.g. "users"; names the audit entry ("users.export") and the CSV file. */
  name: string
  spec: ListSpec
  minRole?: PlatformRole
  /** What the client gets for each row (default: the row as is). Leave out anything staff don't need. */
  toJson?: (row: Row) => unknown
  /** CSV columns, in order: a stable header and how to read the value. */
  csv: { header: string; value: (row: Row) => unknown }[]
}

const RESERVED = new Set(["q", "sort", "dir", "cursor", "limit", "format"])

/** Every query-string key the spec filters on, fixed-choice and by-value alike. */
export const listFilterKeys = (spec: ListSpec) => [...Object.keys(spec.filters ?? {}), ...Object.keys(spec.valueFilters ?? {})]

export function listParams(search: URLSearchParams, spec: ListSpec): ListParams {
  const filters: Record<string, string> = {}
  for (const key of listFilterKeys(spec)) {
    if (RESERVED.has(key)) continue
    const value = search.get(key)
    if (value) filters[key] = value
  }
  const limit = Number(search.get("limit"))
  return {
    q: search.get("q"),
    sort: search.get("sort"),
    dir: search.get("dir"),
    cursor: search.get("cursor"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    filters,
  }
}

const NO_STORE = { "cache-control": "no-store" }

export function adminListRoute<Row = Record<string, unknown>>(options: AdminListOptions<Row>) {
  return async (request: Request): Promise<Response> => {
    try {
      const search = new URL(request.url).searchParams
      const params = listParams(search, options.spec)

      if (search.get("format") === "csv") {
        // counts as a write: exports are heavier and leave the platform
        const admin = await requireAdminSession(options.minRole, { write: true })
        const { rows, truncated } = await listAll<Row>(db(), options.spec, params, CSV_EXPORT_MAX)
        const meta = await requestMeta()
        await writeAudit(db(), {
          actorId: admin.user.id,
          action: `${options.name}.export`,
          targetType: options.name,
          after: { q: params.q || null, filters: params.filters, sort: params.sort || null, dir: params.dir || null, rows: rows.length, truncated },
          ip: meta.ip,
          userAgent: meta.userAgent,
        })
        const body = toCsv([options.csv.map((c) => c.header), ...rows.map((row) => options.csv.map((c) => c.value(row)))])
        const day = new Date().toISOString().slice(0, 10)
        return new Response(body, {
          headers: {
            ...NO_STORE,
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="apex-${options.name}-${day}.csv"`,
            "x-export-truncated": truncated ? String(CSV_EXPORT_MAX) : "",
          },
        })
      }

      await requireAdminSession(options.minRole)
      const page = await listPage<Row>(db(), options.spec, params)
      const rows = options.toJson ? page.rows.map(options.toJson) : page.rows
      return Response.json({ rows, nextCursor: page.nextCursor }, { headers: NO_STORE })
    } catch (err) {
      return adminErrorResponse(err)
    }
  }
}
