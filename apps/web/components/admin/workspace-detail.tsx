"use client"

import type { AdminWorkspaceDetail, MemberRole, Plan } from "@apex/db"
import { ArrowLeft, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { LOCALE_META, LOCALES, type Locale } from "@/lib/i18n/config"
import { formatDate, formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { button, ConfirmDialog, dangerButton, Empty, field, fill, postJson, Section, Table, tag, td, When, type Jsonify } from "./detail-ui"

// /admin/workspaces/[id]: one workspace, its team, invitations and sites, and what staff can do to it.
// Every action goes through POST /api/admin/workspaces/<id>/<action> with a reason (the staff note
// aside); the page re-renders from the server after each one, so it always shows what the database holds.

export type WorkspaceDetailJson = Jsonify<AdminWorkspaceDetail>
type Member = WorkspaceDetailJson["members"][number]
type Invite = WorkspaceDetailJson["invites"][number]

type Dialog =
  | { kind: "plan" | "suspend" | "unsuspend" | "delete" }
  | { kind: "role" | "transfer" | "remove"; member: Member }
  | { kind: "resend" | "revoke"; invite: Invite }
type Kind = Dialog["kind"]

const SPEC: Record<Kind, { path: string; stepUp: boolean; danger?: boolean }> = {
  plan: { path: "plan", stepUp: true },
  suspend: { path: "suspend", stepUp: true, danger: true },
  unsuspend: { path: "unsuspend", stepUp: true },
  delete: { path: "delete", stepUp: true, danger: true },
  role: { path: "member-role", stepUp: true },
  transfer: { path: "transfer-ownership", stepUp: true },
  remove: { path: "member-remove", stepUp: true, danger: true },
  resend: { path: "invite-resend", stepUp: false },
  revoke: { path: "invite-revoke", stepUp: true, danger: true },
}

const ROLES: MemberRole[] = ["owner", "admin", "member"]
const linkButton = "cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-xs font-medium text-[var(--color-text)] underline-offset-2 hover:underline"

export function WorkspaceDetail({ detail }: { detail: WorkspaceDetailJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.workspaces.detail
  const ws = app.admin!.workspaces
  const router = useRouter()
  const { workspace: w } = detail
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const owners = detail.members.filter((m) => m.role === "owner").length
  const open = (d: Dialog) => {
    setNotice(null)
    setDialog(d)
  }
  function done(kind: Kind) {
    setDialog(null)
    if (kind === "delete") return router.push("/admin/workspaces")
    setNotice(t.done[kind as Exclude<Kind, "delete">])
    router.refresh()
  }

  // oldest first; the plan before the first recorded change is where the workspace started
  const timeline = [
    { id: "created", at: w.createdAt, label: t.timeline.created, plan: (detail.planHistory[0]?.from ?? w.plan) as Plan, actor: null as string | null, reason: null as string | null },
    ...detail.planHistory.map((h) => ({
      id: h.id,
      at: h.createdAt,
      label: fill(t.timeline.changed, { from: h.from ? ws.plans[h.from] : "?", to: h.to ? ws.plans[h.to] : "?" }),
      plan: (h.to ?? w.plan) as Plan,
      actor: h.actorName ?? t.deletedStaff,
      reason: h.reason,
    })),
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-col gap-2">
        <Link href="/admin/workspaces" className="inline-flex w-fit items-center gap-1 text-sm text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 break-words text-2xl font-semibold tracking-tight">{w.name}</h1>
          <span className={`${tag} bg-[var(--color-text)] text-[var(--color-surface)]`}>{ws.plans[w.plan]}</span>
          <span className={cn(tag, w.suspendedAt ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-green-500/15 text-green-800 dark:text-green-300")}>
            {ws.statuses[w.suspendedAt ? "suspended" : "active"]}
          </span>
        </div>
      </header>

      {w.suspendedAt && (
        <p className="m-0 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">{t.suspendedBanner}</p>
      )}
      {notice && (
        <p role="status" className="m-0 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.overview}>
            <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
              {(
                [
                  [t.fields.id, <code key="id" className="break-all text-xs">{w.id}</code>],
                  [t.fields.plan, ws.plans[w.plan]],
                  [t.fields.size, w.size ? ws.sizes[w.size] : ws.sizes.none],
                  [t.fields.created, formatDate(w.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })],
                  [
                    t.fields.lastActivity,
                    <span key="a" title={t.fields.lastActivityHint}>
                      {w.lastActivityAt ? <When at={w.lastActivityAt} locale={locale} /> : ws.never}
                    </span>,
                  ],
                  [t.fields.suspended, w.suspendedAt ? formatDate(w.suspendedAt, locale, { dateStyle: "medium", timeStyle: "short" }) : t.fields.notSuspended],
                  ...(w.suspendedReason ? [[t.fields.suspendedReason, <span key="r" className="whitespace-pre-wrap">{w.suspendedReason}</span>] as const] : []),
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[var(--color-muted)]">{label}</dt>
                  <dd className="m-0 min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title={t.sections.plan}>
            <ol className="m-0 flex list-none flex-col p-0">
              {timeline.map((e, i) => {
                const current = i === timeline.length - 1
                return (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {!current && <span className="absolute left-[5px] top-4 h-full w-px bg-[var(--color-line)]" aria-hidden />}
                    <span className={cn("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2", current ? "border-[var(--color-text)] bg-[var(--color-text)]" : "border-[var(--color-muted)] bg-[var(--color-surface)]")} aria-hidden />
                    <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {e.label}
                        {i === 0 && <span className="font-normal text-[var(--color-muted)]">· {ws.plans[e.plan]}</span>}
                        {current && <span className={`${tag} bg-[var(--color-bubble)] text-[var(--color-text)]`}>{t.timeline.current}</span>}
                      </span>
                      <span className="text-xs text-[var(--color-muted)]">
                        {e.actor && <>{fill(t.by, { name: e.actor })} · </>}
                        {formatDate(e.at, locale, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      {e.reason && (
                        <span className="whitespace-pre-wrap break-words text-xs">
                          <span className="text-[var(--color-muted)]">{t.reasonPrefix}</span> {e.reason}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
            {!detail.planHistory.length && <Empty>{t.timeline.none}</Empty>}
          </Section>

          <Section title={t.sections.members} count={detail.members.length}>
            {detail.members.length ? (
              <Table head={[t.memberColumns.member, t.memberColumns.role, t.memberColumns.joined, t.memberColumns.lastLogin, t.memberColumns.actions]}>
                {detail.members.map((m) => {
                  const lastOwner = m.role === "owner" && owners === 1
                  return (
                    <tr key={m.userId} className="border-t border-[var(--color-line)]">
                      <td className={td}>
                        <Link href={`/admin/users/${m.userId}`} className="font-medium">
                          {m.name}
                        </Link>
                        <span className="block break-all text-xs text-[var(--color-muted)]">{m.email}</span>
                        {m.onlyWorkspace && <span className="text-xs text-[var(--color-muted)]">{t.onlyWorkspace}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {t.roles[m.role]}
                        {lastOwner && <span className="block text-xs text-[var(--color-muted)]">{t.lastOwner}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(m.joinedAt, locale)}</td>
                      <td className={td}>{m.lastLoginAt ? <When at={m.lastLoginAt} locale={locale} /> : ws.never}</td>
                      <td className={td}>
                        <span className="flex flex-col items-start gap-1.5">
                          <button type="button" className={linkButton} onClick={() => open({ kind: "role", member: m })}>
                            {t.memberActions.role}
                          </button>
                          {!(m.role === "owner" && owners === 1) && (
                            <button type="button" className={linkButton} onClick={() => open({ kind: "transfer", member: m })}>
                              {t.memberActions.transfer}
                            </button>
                          )}
                          {!lastOwner && (
                            <button type="button" className={cn(linkButton, "text-red-700 dark:text-red-300")} onClick={() => open({ kind: "remove", member: m })}>
                              {t.memberActions.remove}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </Table>
            ) : (
              <Empty>{t.noMembers}</Empty>
            )}
          </Section>

          <Section title={t.sections.invites} count={detail.invites.length}>
            {detail.invites.length ? (
              <Table head={[t.inviteColumns.email, t.inviteColumns.role, t.inviteColumns.invitedBy, t.inviteColumns.sent, t.inviteColumns.expires, t.inviteColumns.actions]}>
                {detail.invites.map((i) => {
                  const expired = new Date(i.expiresAt).getTime() <= Date.now()
                  return (
                    <tr key={i.id} className="border-t border-[var(--color-line)]">
                      <td className={`${td} break-all`}>{i.email}</td>
                      <td className={td}>{t.roles[i.role]}</td>
                      <td className={td}>{i.invitedBy ?? "—"}</td>
                      <td className={td}>
                        <When at={i.createdAt} locale={locale} />
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {expired ? <span className={`${tag} bg-[var(--color-bubble)] text-[var(--color-muted)]`}>{t.expired}</span> : formatDate(i.expiresAt, locale)}
                      </td>
                      <td className={td}>
                        <span className="flex flex-col items-start gap-1.5">
                          <button type="button" className={linkButton} onClick={() => open({ kind: "resend", invite: i })}>
                            {t.inviteActions.resend}
                          </button>
                          <button type="button" className={cn(linkButton, "text-red-700 dark:text-red-300")} onClick={() => open({ kind: "revoke", invite: i })}>
                            {t.inviteActions.revoke}
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </Table>
            ) : (
              <Empty>{t.noInvites}</Empty>
            )}
          </Section>

          <Section title={t.sections.sites} count={detail.sites.length}>
            {detail.sites.length ? (
              <Table head={[t.siteColumns.site, t.siteColumns.status, t.siteColumns.seen, t.siteColumns.conversations, t.siteColumns.knowledge]}>
                {detail.sites.map((s) => {
                  const status = s.disabledAt ? "disabled" : w.suspendedAt ? "suspended" : "serving"
                  return (
                    <tr key={s.id} className="border-t border-[var(--color-line)]">
                      <td className={`${td} max-w-xs`}>
                        <Link href={`/admin/bots/${s.id}`} className="font-medium">
                          {s.name}
                        </Link>
                        <span className="block break-all text-xs text-[var(--color-muted)]">
                          {s.allowedOrigins[0] ?? t.noOrigins}
                          {s.allowedOrigins.length > 1 && ` +${s.allowedOrigins.length - 1}`}
                        </span>
                      </td>
                      <td className={td}>
                        <span
                          className={cn(
                            tag,
                            status === "serving" ? "bg-green-500/15 text-green-800 dark:text-green-300" : "bg-red-500/15 text-red-700 dark:text-red-300",
                          )}
                        >
                          {t.siteStatuses[status]}
                        </span>
                      </td>
                      <td className={td}>{s.widgetSeenAt ? <When at={s.widgetSeenAt} locale={locale} /> : ws.never}</td>
                      <td className={`${td} tabular-nums`}>{formatNumber(s.conversations, locale)}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {formatNumber(s.sources, locale)} / {formatNumber(s.pages, locale)}
                      </td>
                    </tr>
                  )
                })}
              </Table>
            ) : (
              <Empty>{t.noSites}</Empty>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.actions}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(["plan", w.suspendedAt ? "unsuspend" : "suspend", "delete"] as const).map((kind) => (
                <li key={kind}>
                  <button type="button" onClick={() => open({ kind })} className={cn(button, "w-full justify-start", SPEC[kind].danger && dangerButton)}>
                    {t.actions[kind].label}
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Note workspaceId={w.id} initial={w.adminNote ?? ""} onSaved={() => router.refresh()} />

          <Section title={t.sections.audit} count={detail.audit.length}>
            {detail.audit.length ? (
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
                {detail.audit.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 border-l-2 border-[var(--color-line)] pl-3">
                    <span className="font-medium">{t.auditActions[a.action] ?? a.action}</span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {fill(t.by, { name: a.actorName ?? t.deletedStaff })} · <When at={a.createdAt} locale={locale} />
                    </span>
                    {a.reason && (
                      <span className="whitespace-pre-wrap break-words text-xs">
                        <span className="text-[var(--color-muted)]">{t.reasonPrefix}</span> {a.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>{t.noAudit}</Empty>
            )}
          </Section>
        </aside>
      </div>

      {dialog && <ActionDialog dialog={dialog} detail={detail} onClose={() => setDialog(null)} onDone={() => done(dialog.kind)} />}
    </div>
  )
}

function Note({ workspaceId, initial, onSaved }: { workspaceId: string; initial: string; onSaved: () => void }) {
  const { t: app } = useAppI18n()
  const t = app.admin!.workspaces.detail
  const [note, setNote] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    const res = await postJson(`/api/admin/workspaces/${workspaceId}/note`, { note })
    setBusy(false)
    if (!res.ok) return setError(res.message || app.admin!.users.detail.dialog.failed)
    setSaved(true)
    onSaved()
  }

  return (
    <Section title={t.sections.note}>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder={t.notePlaceholder}
          aria-label={t.sections.note}
          className={`${field} min-h-24 resize-y py-2`}
        />
        {error && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="m-0 text-sm text-green-700 dark:text-green-300">
            {t.noteSaved}
          </p>
        )}
        <button type="submit" disabled={busy || note.trim() === initial.trim()} className={cn(button, "self-end")}>
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {t.saveNote}
        </button>
      </form>
    </Section>
  )
}

function ActionDialog({ dialog, detail, onClose, onDone }: { dialog: Dialog; detail: WorkspaceDetailJson; onClose: () => void; onDone: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.workspaces.detail
  const ws = app.admin!.workspaces
  const shared = app.admin!.users.detail.dialog
  const { workspace: w } = detail
  const spec = SPEC[dialog.kind]
  const member = "member" in dialog ? dialog.member : null
  const invite = "invite" in dialog ? dialog.invite : null

  const [plan, setPlan] = useState<Plan>(detail.planPreviews[0]?.plan ?? w.plan)
  const [role, setRole] = useState<MemberRole>(ROLES.find((r) => r !== member?.role) ?? "member")
  const [confirmName, setConfirmName] = useState("")
  const [mailLocale, setMailLocale] = useState<Locale>(locale)

  const preview = detail.planPreviews.find((p) => p.plan === plan)
  const ready = dialog.kind !== "delete" || confirmName.trim() === w.name.trim()
  const label = "flex flex-col gap-1.5 text-sm font-medium"

  function body(): Record<string, unknown> {
    switch (dialog.kind) {
      case "plan":
        return { plan }
      case "delete":
        return { confirmName }
      case "role":
        return { userId: member!.userId, role }
      case "transfer":
      case "remove":
        return { userId: member!.userId }
      case "resend":
        return { inviteId: invite!.id, locale: mailLocale }
      case "revoke":
        return { inviteId: invite!.id }
      default:
        return {}
    }
  }

  return (
    <ConfirmDialog
      title={t.actions[dialog.kind].label}
      text={fill(t.actions[dialog.kind].text, { name: member?.name ?? "", email: invite?.email ?? "" })}
      danger={spec.danger}
      stepUp={spec.stepUp}
      ready={ready}
      submit={(reason) => postJson(`/api/admin/workspaces/${w.id}/${spec.path}`, { reason, ...body() })}
      onClose={onClose}
      onDone={onDone}
    >
      {dialog.kind === "plan" && (
        <>
          <label className={label}>
            {t.dialog.plan}
            <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className={`${field} h-10 cursor-pointer`}>
              {detail.planPreviews.map((p) => (
                <option key={p.plan} value={p.plan}>
                  {ws.plans[p.plan]}
                </option>
              ))}
            </select>
          </label>
          {preview && (
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3 text-sm">
              <Table head={[t.dialog.limit, `${t.dialog.from} · ${ws.plans[w.plan]}`, `${t.dialog.to} · ${ws.plans[plan]}`]}>
                {preview.limits.map((l) => (
                  <tr key={l.key} className="border-t border-[var(--color-line)]">
                    <td className={td}>{t.limits[l.key] ?? l.key}</td>
                    <td className={`${td} tabular-nums`}>
                      {formatNumber(l.from, locale)}
                      {l.effectiveFrom !== l.from && <span className="block text-xs text-[var(--color-muted)]">{fill(t.dialog.ceiling, { n: formatNumber(l.effectiveFrom, locale) })}</span>}
                    </td>
                    <td className={cn(td, "tabular-nums font-medium", l.effectiveTo < l.effectiveFrom && "text-red-700 dark:text-red-300", l.effectiveTo > l.effectiveFrom && "text-green-700 dark:text-green-300")}>
                      {formatNumber(l.to, locale)}
                      {l.effectiveTo !== l.to && <span className="block text-xs font-normal text-[var(--color-muted)]">{fill(t.dialog.ceiling, { n: formatNumber(l.effectiveTo, locale) })}</span>}
                      {l.effectiveTo === l.effectiveFrom && <span className="block text-xs font-normal text-[var(--color-muted)]">{t.dialog.unchanged}</span>}
                    </td>
                  </tr>
                ))}
              </Table>
              {preview.overLimit.length ? (
                <div>
                  <p className="m-0 font-medium text-red-700 dark:text-red-300">{fill(t.dialog.overLimit, { n: formatNumber(preview.overLimit[0]!.limit, locale) })}</p>
                  <ul className="m-0 mt-1 pl-5">
                    {preview.overLimit.map((s) => (
                      <li key={s.sourceId} className="break-words">
                        {s.botName} · {s.title}: {formatNumber(s.pages, locale)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="m-0 text-[var(--color-muted)]">{t.dialog.noOverLimit}</p>
              )}
            </div>
          )}
        </>
      )}

      {dialog.kind === "role" && (
        <label className={label}>
          {t.dialog.role}
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={`${field} h-10 cursor-pointer`}>
            {ROLES.filter((r) => r !== member?.role).map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </select>
        </label>
      )}

      {dialog.kind === "resend" && (
        <label className={label}>
          {shared.language}
          <select value={mailLocale} onChange={(e) => setMailLocale(e.target.value as Locale)} className={`${field} h-10 cursor-pointer`}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_META[l].name}
              </option>
            ))}
          </select>
        </label>
      )}

      {dialog.kind === "delete" && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
            <p className="m-0">
              {fill(t.dialog.deleteImpact, {
                sites: formatNumber(detail.deletion.sites, locale),
                sources: formatNumber(detail.deletion.sources, locale),
                conversations: formatNumber(detail.deletion.conversations, locale),
                members: formatNumber(detail.deletion.members, locale),
              })}
            </p>
            {detail.deletion.rehomed.length ? (
              <div>
                <p className="m-0 font-medium">{t.dialog.rehomed}</p>
                <ul className="m-0 mt-1 pl-5">
                  {detail.deletion.rehomed.map((r) => (
                    <li key={r.userId} className="break-all">
                      {r.email}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="m-0">{t.dialog.noRehomed}</p>
            )}
          </div>
          <label className={label}>
            {fill(t.dialog.confirmName, { name: w.name })}
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" spellCheck={false} className={`${field} h-10`} />
          </label>
        </>
      )}
    </ConfirmDialog>
  )
}
