import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Lock } from "lucide-react"
import { auditDiff, getAuditEntry, type DiffLine } from "@apex/db"
import { targetHref } from "@/components/admin/audit-target"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { format as fill } from "@/lib/i18n"
import { getAdminDictionary } from "@/lib/i18n/app"
import { formatDate } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

export async function generateMetadata({ params }: PageProps<"/admin/audit/[id]">): Promise<Metadata> {
  return { title: fill(getAdminDictionary(await requestLocale()).audit.detail.title, { id: (await params).id }) }
}

// detail-ui's classes, repeated here: a server page can't read values out of a client module
const card = "flex flex-col gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
const th = "whitespace-nowrap px-3 py-2 font-semibold"
const td = "px-3 py-2.5 align-top"

const KIND_TONE: Record<DiffLine["kind"], string> = {
  added: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  removed: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
  changed: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  same: "bg-[var(--color-raised)] text-[var(--color-muted)]",
}

function Value({ value, empty }: { value: unknown; empty: string }) {
  if (value === undefined) return <span className="text-[var(--color-muted)]">{empty}</span>
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return <code className="whitespace-pre-wrap break-all text-xs">{text}</code>
}

function DiffRows({ lines, empty }: { lines: DiffLine[]; empty: string }) {
  return lines.map((d) => (
    <tr key={`${d.kind}:${d.path}`} className="border-t border-[var(--color-line)]">
      <td className={cn(td, "whitespace-nowrap")}>
        <code className="text-xs">{d.path || "value"}</code>
      </td>
      <td className={cn(td, d.kind === "removed" || d.kind === "changed" ? "bg-[var(--color-danger)]/5" : "")}>
        <Value value={d.before} empty={empty} />
      </td>
      <td className={cn(td, d.kind === "added" || d.kind === "changed" ? "bg-[var(--color-success)]/5" : "")}>
        <Value value={d.after} empty={empty} />
      </td>
    </tr>
  ))
}

export default async function AdminAuditEntryPage({ params }: PageProps<"/admin/audit/[id]">) {
  await requirePlatformAdmin()
  const locale = await requestLocale()
  const dict = getAdminDictionary(locale)
  const t = dict.audit.detail
  const entry = await getAuditEntry(db(), (await params).id)
  if (!entry) notFound()

  const actions: Record<string, string> = {
    ...dict.users.detail.auditActions,
    ...dict.workspaces.detail.auditActions,
    ...dict.bots.detail.auditActions,
    ...dict.knowledge.detail.auditActions,
    ...dict.audit.actions,
  }
  const diff = auditDiff(entry.before, entry.after)
  const changed = diff.filter((d) => d.kind !== "same")
  const same = diff.filter((d) => d.kind === "same")
  const href = targetHref(entry.target_type, entry.target_id)
  const head = (
    <thead className="bg-[var(--color-raised)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
      <tr>
        <th scope="col" className={th}>
          {t.columns.field}
        </th>
        <th scope="col" className={th}>
          {t.columns.before}
        </th>
        <th scope="col" className={th}>
          {t.columns.after}
        </th>
      </tr>
    </thead>
  )
  const facts: [string, React.ReactNode][] = [
    [t.when, formatDate(entry.created_at, locale, { dateStyle: "full", timeStyle: "long" })],
    [
      t.actor,
      entry.actor_id ? (
        <Link href={`/admin/audit?actor=${entry.actor_id}`} className="text-[var(--color-text)] hover:underline">
          {entry.actor_name ? `${entry.actor_name} · ${entry.actor_email}` : entry.actor_email}
        </Link>
      ) : (
        dict.audit.system
      ),
    ],
    [
      t.action,
      <span key="a" className="flex flex-col">
        {actions[entry.action] ?? entry.action}
        <code className="text-xs text-[var(--color-muted)]">{entry.action}</code>
      </span>,
    ],
    [
      t.target,
      <span key="t" className="flex flex-col">
        <span>{dict.audit.targetTypes[entry.target_type] ?? entry.target_type}</span>
        {entry.target_id &&
          (href ? (
            <Link href={href} className="text-[var(--color-text)] hover:underline">
              {entry.target_label ?? entry.target_id}
            </Link>
          ) : (
            <code className="text-xs">{entry.target_label ?? entry.target_id}</code>
          ))}
        {entry.target_id && (
          <Link href={`/admin/audit?${new URLSearchParams({ target: entry.target_id })}`} className="text-xs text-[var(--color-muted)] hover:underline">
            {dict.audit.title}
          </Link>
        )}
      </span>,
    ],
    [t.reason, entry.reason ?? <span className="text-[var(--color-muted)]">{t.noReason}</span>],
    [t.ip, entry.ip ? <code className="text-xs">{entry.ip}</code> : "—"],
    [t.userAgent, entry.user_agent ? <span className="break-all text-xs">{entry.user_agent}</span> : "—"],
  ]

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <Link href="/admin/audit" className="flex items-center gap-1.5 self-start text-sm text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.back}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold tracking-tight">{actions[entry.action] ?? entry.action}</h1>
        <p className="m-0 flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {fill(t.title, { id: entry.id })} · {dict.audit.immutable}
        </p>
      </header>

      <section className={card}>
        <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-sm text-[var(--color-muted)]">{label}</dt>
              <dd className="m-0 min-w-0 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={card}>
        <h2 className="m-0 flex flex-wrap items-center gap-2 text-base font-semibold">
          {t.changes}
          {(["added", "removed", "changed"] as const).map((k) => {
            const count = changed.filter((d) => d.kind === k).length
            return count ? (
              <span key={k} className={cn(tag, KIND_TONE[k])}>
                {t.kinds[k]} · {count}
              </span>
            ) : null
          })}
        </h2>
        {changed.length ? (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
            <table className="w-full border-collapse text-sm">
              {head}
              <tbody>
                <DiffRows lines={changed} empty={t.empty} />
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-sm text-[var(--color-muted)]">{t.noDiff}</p>
        )}
        {same.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-[var(--color-muted)]">{fill(t.showSame, { n: same.length })}</summary>
            <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--color-line)]">
              <table className="w-full border-collapse text-sm">
                {head}
                <tbody>
                  <DiffRows lines={same} empty={t.empty} />
                </tbody>
              </table>
            </div>
          </details>
        )}
        {(entry.before != null || entry.after != null) && (
          <details>
            <summary className="cursor-pointer text-sm text-[var(--color-muted)]">{t.raw}</summary>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {(
                [
                  [t.before, entry.before],
                  [t.after, entry.after],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
                  <pre className="m-0 max-h-96 overflow-auto rounded-lg bg-[var(--color-raised)] p-3 text-xs">{value == null ? t.empty : JSON.stringify(value, null, 2)}</pre>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  )
}
