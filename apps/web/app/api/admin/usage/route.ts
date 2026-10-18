import { parseUsageRange, usageExportRows, writeAudit } from "@apex/db"
import { adminErrorResponse } from "@/lib/admin"
import { CSV_EXPORT_MAX } from "@/lib/admin-list"
import { requestMeta, requireAdminSession } from "@/lib/auth"
import { toCsv } from "@/lib/csv"
import { db } from "@/lib/db"

// GET /api/admin/usage?days=7|30|90 → token usage and estimated cost per bot and UTC day, as CSV.
// Audited like the list exports: it takes workspace data out of the platform.
export async function GET(request: Request): Promise<Response> {
  try {
    // counts as a write: exports are heavier and leave the platform
    const admin = await requireAdminSession("support", { write: true })
    const days = parseUsageRange(new URL(request.url).searchParams.get("days"))
    const { rows, truncated } = await usageExportRows(db(), days, CSV_EXPORT_MAX)
    const meta = await requestMeta()
    await writeAudit(db(), {
      actorId: admin.user.id,
      action: "usage.export",
      targetType: "usage",
      after: { days, rows: rows.length, truncated },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    const body = toCsv([
      ["day", "bot_id", "bot", "workspace_id", "workspace", "plan", "provider", "model", "tokens", "input_tokens", "output_tokens", "unsplit_tokens", "estimated_cost_usd", "priced"],
      ...rows.map((r) => [
        r.day,
        r.botId,
        r.botName,
        r.organizationId,
        r.organizationName,
        r.plan,
        r.model.provider,
        r.model.id,
        r.tokens,
        r.input,
        r.output,
        r.unsplit,
        r.model.price ? r.cost.toFixed(6) : "",
        r.model.price ? "yes" : "no",
      ]),
    ])
    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="apex-usage-${days}d-${new Date().toISOString().slice(0, 10)}.csv"`,
        "x-export-truncated": truncated ? String(CSV_EXPORT_MAX) : "",
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
