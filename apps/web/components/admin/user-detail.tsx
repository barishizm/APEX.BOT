"use client"

import type { AdminUserDetail, PlatformRole } from "@apex/db"
import { ArrowLeft, LoaderCircle, Lock } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useState, type FormEvent } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { LOCALE_META, LOCALES, type Locale } from "@/lib/i18n/config"
import { formatDate, formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { button, dangerButton, Empty, field, fill, postJson, primaryButton, Section, Table, tag, td, When, type Jsonify } from "./detail-ui"

// /admin/users/[id]: one account, and what staff can do to it. Every action goes through
// POST /api/admin/users/<id>/<action> with a reason; the destructive ones first confirm a code from
// the staff member's authenticator app (POST /api/admin/step-up). The page re-renders from the
// server after each change, so what it shows is always what the database holds.

export type UserDetailJson = Jsonify<AdminUserDetail>

type ActionKey =
  | "verifyEmail"
  | "resendVerification"
  | "passwordReset"
  | "resetTwoFactor"
  | "revokeSessions"
  | "suspend"
  | "unsuspend"
  | "delete"
  | "grantSupport"
  | "revokeSupport"

interface ActionSpec {
  path: string
  stepUp: boolean
  /** Sends the user an email, in a language staff pick. */
  mail?: boolean
  /** The email is optional (a checkbox). */
  notify?: boolean
  danger?: boolean
  body?: Record<string, unknown>
}

const ACTIONS: Record<ActionKey, ActionSpec> = {
  verifyEmail: { path: "verify-email", stepUp: true },
  resendVerification: { path: "resend-verification", stepUp: false, mail: true },
  passwordReset: { path: "password-reset", stepUp: false, mail: true },
  resetTwoFactor: { path: "reset-two-factor", stepUp: true, mail: true, danger: true },
  revokeSessions: { path: "revoke-sessions", stepUp: true, danger: true },
  suspend: { path: "suspend", stepUp: true, mail: true, notify: true, danger: true },
  unsuspend: { path: "unsuspend", stepUp: true, mail: true, notify: true },
  delete: { path: "delete", stepUp: true, mail: true, danger: true },
  grantSupport: { path: "role", stepUp: true, body: { role: "support" } },
  revokeSupport: { path: "role", stepUp: true, body: { role: null }, danger: true },
}

export function UserDetail({ detail, viewer }: { detail: UserDetailJson; viewer: { id: string; role: PlatformRole } }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.users.detail
  const users = app.admin!.users
  const router = useRouter()
  const { profile: p } = detail
  const [open, setOpen] = useState<ActionKey | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // the same rules the server enforces (admin-users.ts lockTarget); this only hides what would be refused
  const locked = p.id === viewer.id ? t.locked.self : p.platformRole === "superadmin" ? t.locked.superadmin : p.platformRole && viewer.role !== "superadmin" ? t.locked.staff : null

  const available: ActionKey[] = locked
    ? []
    : ([
        !p.emailVerifiedAt && "verifyEmail",
        !p.emailVerifiedAt && "resendVerification",
        "passwordReset",
        p.twoFactorAt && "resetTwoFactor",
        detail.sessions.length > 0 && "revokeSessions",
        p.suspendedAt ? "unsuspend" : "suspend",
        viewer.role === "superadmin" && (p.platformRole === "support" ? "revokeSupport" : "grantSupport"),
        "delete",
      ].filter(Boolean) as ActionKey[])

  function done(action: ActionKey) {
    setOpen(null)
    if (action === "delete") {
      router.push("/admin/users")
      return
    }
    setNotice(t.done[action as Exclude<ActionKey, "delete">])
    router.refresh()
  }

  const name = p.displayName ?? p.username
  const status = p.suspendedAt ? "suspended" : p.emailVerifiedAt ? "active" : "unverified"

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-col gap-2">
        <Link href="/admin/users" className="inline-flex w-fit items-center gap-1 text-sm text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">{name}</h1>
          <span
            className={cn(
              tag,
              status === "active" && "bg-green-500/15 text-green-800 dark:text-green-300",
              status === "unverified" && "bg-[var(--color-bubble)] text-[var(--color-muted)]",
              status === "suspended" && "bg-red-500/15 text-red-700 dark:text-red-300",
            )}
          >
            {users.statuses[status]}
          </span>
          {p.platformRole && <span className={`${tag} bg-amber-500/15 text-amber-800 dark:text-amber-200`}>{users.roles[p.platformRole]}</span>}
        </div>
        <p className="m-0 break-all text-[var(--color-muted)]">{p.email}</p>
      </header>

      {notice && (
        <p role="status" className="m-0 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.profile}>
            <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
              {(
                [
                  [t.fields.id, <code key="id" className="break-all text-xs">{p.id}</code>],
                  [t.fields.email, <span key="e" className="break-all">{p.email}</span>],
                  [t.fields.username, p.username],
                  [t.fields.displayName, p.displayName ?? "—"],
                  [t.fields.accountType, users.accountTypes[p.accountType]],
                  [t.fields.platformRole, p.platformRole ? users.roles[p.platformRole] : users.roles.none],
                  [t.fields.emailStatus, p.emailVerifiedAt ? fill(t.verifiedOn, { date: formatDate(p.emailVerifiedAt, locale) }) : t.notVerified],
                  [t.fields.twoFactor, p.twoFactorAt ? fill(t.twoFactorOn, { date: formatDate(p.twoFactorAt, locale) }) : t.twoFactorOff],
                  ...(p.twoFactorAt ? [[t.fields.recoveryCodes, formatNumber(p.recoveryCodesLeft, locale)] as const] : []),
                  [t.fields.password, p.hasPassword ? t.passwordSet : t.passwordNone],
                  [t.fields.lastLogin, p.lastLoginAt ? <When key="l" at={p.lastLoginAt} locale={locale} /> : users.never],
                  [t.fields.created, formatDate(p.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })],
                  [t.fields.suspended, p.suspendedAt ? formatDate(p.suspendedAt, locale, { dateStyle: "medium", timeStyle: "short" }) : t.notSuspended],
                  ...(p.suspendedReason ? [[t.fields.suspendedReason, <span key="r" className="whitespace-pre-wrap">{p.suspendedReason}</span>] as const] : []),
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[var(--color-muted)]">{label}</dt>
                  <dd className="m-0 min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title={t.sections.workspaces} count={detail.memberships.length}>
            {detail.memberships.length ? (
              <Table head={[t.workspaceColumns.name, t.workspaceColumns.plan, t.workspaceColumns.role, t.workspaceColumns.members, t.workspaceColumns.joined]}>
                {detail.memberships.map((m) => (
                  <tr key={m.organizationId} className="border-t border-[var(--color-line)]">
                    <td className={td}>
                      <Link href={`/admin/workspaces/${m.organizationId}`} className="font-medium">
                        {m.name}
                      </Link>
                      {m.suspendedAt && <span className={`${tag} ml-2 bg-red-500/15 text-red-700 dark:text-red-300`}>{t.workspaceSuspended}</span>}
                    </td>
                    <td className={`${td} capitalize`}>{m.plan}</td>
                    <td className={td}>
                      {t.workspaceRoles[m.role]}
                      {m.role === "owner" && m.otherOwners === 0 && m.members > 1 && <span className="ml-1 text-xs text-[var(--color-muted)]">· {t.onlyOwner}</span>}
                    </td>
                    <td className={`${td} tabular-nums`}>{formatNumber(m.members, locale)}</td>
                    <td className={td}>{formatDate(m.joinedAt, locale)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>{t.noWorkspaces}</Empty>
            )}
          </Section>

          <Section title={t.sections.sessions} count={detail.sessions.length}>
            {detail.sessions.length ? (
              <Table head={[t.sessionColumns.device, t.sessionColumns.ip, t.sessionColumns.started, t.sessionColumns.lastSeen, t.sessionColumns.expires]}>
                {detail.sessions.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--color-line)]">
                    <td className={`${td} max-w-xs`}>
                      <span className="line-clamp-2 break-all text-xs" title={s.userAgent ?? undefined}>
                        {s.userAgent ?? t.unknownDevice}
                      </span>
                      {s.persistent && <span className="text-xs text-[var(--color-muted)]">{t.keptSignedIn}</span>}
                    </td>
                    <td className={`${td} font-mono text-xs`}>{s.ip ?? "—"}</td>
                    <td className={td}>
                      <When at={s.createdAt} locale={locale} />
                    </td>
                    <td className={td}>
                      <When at={s.lastSeenAt} locale={locale} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(s.expiresAt, locale)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>{t.noSessions}</Empty>
            )}
          </Section>

          <Section title={t.sections.oauth}>
            {detail.oauth.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {detail.oauth.map((o) => (
                  <li key={o.provider} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{users.providers[o.provider]}</span>
                    {o.email && <span className="break-all text-[var(--color-muted)]">{o.email}</span>}
                    <span className="text-xs text-[var(--color-muted)]">{fill(t.linkedOn, { date: formatDate(o.createdAt, locale) })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t.noOAuth}</Empty>
            )}
          </Section>

          <Section title={t.sections.events}>
            {detail.events.length ? (
              <Table head={[t.eventColumns.event, t.eventColumns.ip, t.eventColumns.when]}>
                {detail.events.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--color-line)]">
                    <td className={cn(td, (e.event.endsWith("_failed") || e.event === "login_failed") && "text-red-700 dark:text-red-300")}>
                      {(t.events as Record<string, string>)[e.event] ?? e.event}
                      {e.userAgent && (
                        <span className="block max-w-xs truncate text-xs text-[var(--color-muted)]" title={e.userAgent}>
                          {e.userAgent}
                        </span>
                      )}
                    </td>
                    <td className={`${td} font-mono text-xs`}>{e.ip ?? "—"}</td>
                    <td className={td}>
                      <When at={e.createdAt} locale={locale} />
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>{t.noEvents}</Empty>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.actions}>
            {locked ? (
              <p className="m-0 flex items-start gap-2 text-sm text-[var(--color-muted)]">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {locked}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {available.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null)
                        setOpen(key)
                      }}
                      className={cn(button, "w-full justify-start", ACTIONS[key].danger && dangerButton)}
                    >
                      {t.actions[key].label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Notes detail={detail} onAdded={() => router.refresh()} />

          <Section title={t.sections.audit} count={detail.audit.length}>
            {detail.audit.length ? (
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
                {detail.audit.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 border-l-2 border-amber-500/40 pl-3">
                    <span className="font-medium">{(t.auditActions as Record<string, string>)[a.action] ?? a.action}</span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {fill(t.by, { name: a.actorName ?? t.deletedStaff })} · <When at={a.createdAt} locale={locale} />
                    </span>
                    {a.reason && a.action !== "user.note" && (
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

      {open && <ActionDialog action={open} detail={detail} onClose={() => setOpen(null)} onDone={() => done(open)} />}
    </div>
  )
}

function Notes({ detail, onAdded }: { detail: UserDetailJson; onAdded: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.users.detail
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    const res = await postJson(`/api/admin/users/${detail.profile.id}/note`, { body })
    setBusy(false)
    if (!res.ok) return setError(res.message || t.dialog.failed)
    setBody("")
    onAdded()
  }

  return (
    <Section title={t.sections.notes} count={detail.notes.length}>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder={t.notePlaceholder}
          aria-label={t.sections.notes}
          className={`${field} min-h-20 resize-y py-2`}
        />
        {error && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !body.trim()} className={cn(button, "self-end")}>
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {t.addNote}
        </button>
      </form>
      {detail.notes.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {detail.notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-[var(--color-raised)] px-3 py-2 text-sm">
              <p className="m-0 whitespace-pre-wrap break-words">{n.body}</p>
              <p className="m-0 mt-1 text-xs text-[var(--color-muted)]">
                {fill(t.by, { name: n.authorName ?? t.deletedStaff })} · <When at={n.createdAt} locale={locale} />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t.noNotes}</Empty>
      )}
    </Section>
  )
}

function ActionDialog({ action, detail, onClose, onDone }: { action: ActionKey; detail: UserDetailJson; onClose: () => void; onDone: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.users.detail
  const spec = ACTIONS[action]
  const { profile: p } = detail
  const titleId = useId()
  const [reason, setReason] = useState("")
  const [mailLocale, setMailLocale] = useState<Locale>(locale)
  const [notify, setNotify] = useState(true)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [code, setCode] = useState("")
  // null until the step-up check answers; true when a code must be typed first
  const [needCode, setNeedCode] = useState<boolean | null>(spec.stepUp ? null : false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!spec.stepUp) return
    let live = true
    fetch("/api/admin/step-up", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ stepUpUntil: string | null }>) : { stepUpUntil: null }))
      .then((r) => live && setNeedCode(!r.stepUpUntil || new Date(r.stepUpUntil).getTime() - Date.now() < 15_000))
      .catch(() => live && setNeedCode(true))
    return () => {
      live = false
    }
  }, [spec.stepUp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const emailMatches = action !== "delete" || confirmEmail.trim().toLowerCase() === p.email
  const ready = reason.trim() && emailMatches && needCode !== null && (!needCode || /^\d{6}$/.test(code.replace(/\s/g, "")))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      if (needCode) {
        const step = await postJson("/api/admin/step-up", { code })
        if (!step.ok) return setError(step.message || t.dialog.failed)
        setNeedCode(false)
        setCode("")
      }
      const body: Record<string, unknown> = { reason, ...spec.body }
      if (spec.mail) body.locale = mailLocale
      if (spec.notify) body.notify = notify
      if (action === "delete") body.confirmEmail = confirmEmail
      const res = await postJson(`/api/admin/users/${p.id}/${spec.path}`, body)
      if (res.ok) return onDone()
      // the confirmation ran out between opening the dialog and confirming
      if (res.code === "step_up_required") setNeedCode(true)
      setError(res.message || t.dialog.failed)
    } finally {
      setBusy(false)
    }
  }

  const label = "flex flex-col gap-1.5 text-sm font-medium"
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => !busy && onClose()} aria-hidden />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-2xl"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-lg font-semibold">
            {t.actions[action].label}
          </h2>
          <p className="m-0 text-sm text-[var(--color-muted)]">{fill(t.actions[action].text, { email: p.email })}</p>
        </div>

        {action === "delete" && (
          <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
            {detail.deletion.deleted.length > 0 && (
              <div>
                <p className="m-0 font-medium">{t.dialog.deleteWorkspaces}</p>
                <ul className="m-0 mt-1 pl-5">
                  {detail.deletion.deleted.map((w) => (
                    <li key={w.organizationId}>{w.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {detail.deletion.transferred.length > 0 && (
              <div>
                <p className="m-0 font-medium">{t.dialog.transferWorkspaces}</p>
                <ul className="m-0 mt-1 pl-5">
                  {detail.deletion.transferred.map((w) => (
                    <li key={w.organizationId} className="break-all">
                      {fill(t.dialog.transferTo, { workspace: w.name, email: w.newOwnerEmail })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!detail.deletion.deleted.length && !detail.deletion.transferred.length && <p className="m-0">{t.dialog.noWorkspaceImpact}</p>}
          </div>
        )}

        <label className={label}>
          {t.dialog.reason}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} required autoFocus className={`${field} resize-y py-2`} />
          <span className="text-xs font-normal text-[var(--color-muted)]">{t.dialog.reasonHint}</span>
        </label>

        {spec.notify && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-amber-500" />
            {t.dialog.notify}
          </label>
        )}

        {spec.mail && (!spec.notify || notify) && (
          <label className={label}>
            {t.dialog.language}
            <select value={mailLocale} onChange={(e) => setMailLocale(e.target.value as Locale)} className={`${field} h-10 cursor-pointer`}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_META[l].name}
                </option>
              ))}
            </select>
          </label>
        )}

        {action === "delete" && (
          <label className={label}>
            {fill(t.dialog.confirmEmail, { email: p.email })}
            <input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" spellCheck={false} className={`${field} h-10`} />
          </label>
        )}

        {needCode && (
          <label className={label}>
            {t.dialog.stepUp}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              pattern="\d{3}\s?\d{3}"
              className={`${field} h-10 font-mono tracking-widest`}
            />
            <span className="text-xs font-normal text-[var(--color-muted)]">{t.dialog.stepUpHint}</span>
          </label>
        )}

        {error && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={button}>
            {t.dialog.cancel}
          </button>
          <button type="submit" disabled={!ready || busy} className={cn(button, spec.danger ? "border-red-600 bg-red-600 text-white hover:bg-red-500" : primaryButton)}>
            {(busy || needCode === null) && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? t.dialog.working : t.dialog.confirm}
          </button>
        </div>
      </form>
    </div>
  )
}
