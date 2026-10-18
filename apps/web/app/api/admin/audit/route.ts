import { ADMIN_AUDIT_LIST, auditDiff, type AuditRow } from "@apex/db"
import { adminListRoute } from "@/lib/admin-list"

// The audit log on /admin/audit; see lib/admin-list.ts for the query string. Read-only: the log has
// no route that changes it, and the database refuses updates and deletes (migration 0029).
export const GET = adminListRoute<AuditRow>({
  name: "audit",
  spec: ADMIN_AUDIT_LIST,
  // the list shows which fields changed; the full before/after is on the entry's own page
  toJson: ({ before, after, ...row }) => ({
    ...row,
    changes: auditDiff(before, after)
      .filter((d) => d.kind !== "same")
      .map((d) => d.path || "value"),
  }),
  csv: [
    { header: "id", value: (l) => l.id },
    { header: "created_at", value: (l) => l.created_at },
    { header: "actor_id", value: (l) => l.actor_id },
    { header: "actor_email", value: (l) => l.actor_email },
    { header: "action", value: (l) => l.action },
    { header: "target_type", value: (l) => l.target_type },
    { header: "target_id", value: (l) => l.target_id },
    { header: "target", value: (l) => l.target_label },
    { header: "reason", value: (l) => l.reason },
    { header: "before", value: (l) => (l.before == null ? "" : JSON.stringify(l.before)) },
    { header: "after", value: (l) => (l.after == null ? "" : JSON.stringify(l.after)) },
    { header: "ip", value: (l) => l.ip },
  ],
})
