"use client"

import { LoaderCircle, Send } from "lucide-react"
import { useState, type FormEvent } from "react"
import type { MemberRole, Team } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format } from "@/lib/i18n"
import { formatDate } from "@/lib/i18n/format"

// Team as /api/team returns it: dates are strings
type Json<T> = T extends Date ? string : T extends (infer U)[] ? Json<U>[] : T extends object ? { [K in keyof T]: Json<T[K]> } : T
type TeamJson = Json<Team>
type Member = TeamJson["members"][number]
type Invite = TeamJson["invites"][number]

const card = "flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
const input = "h-10 min-w-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)]"
const primary =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
const secondary =
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
const danger =
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
const errorText = "m-0 text-sm text-red-600 dark:text-red-400"
const okText = "m-0 text-sm text-green-700 dark:text-green-400"

async function call(path: string, method: string, offline: string, body?: object) {
  try {
    const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { message: offline } }
  }
}

export function TeamManager({ initial, me }: { initial: TeamJson; me: string }) {
  const { t: app, locale } = useAppI18n()
  const t = app.team
  const [team, setTeam] = useState(initial)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const send = (path: string, method: string, body?: object) => call(path, method, t.offline, body)
  const isOwner = team.role === "owner"
  const canInvite = isOwner || team.role === "admin"
  const owners = team.members.filter((m) => m.role === "owner").length

  const refresh = async () => {
    const { ok, data } = await send("/api/team", "GET")
    if (ok) setTeam(data)
  }

  // runs one action at a time; `key` marks which control shows the spinner
  const run = async (key: string, action: () => Promise<{ ok: boolean; data: any }>, success?: string) => {
    setBusy(key)
    setNotice(null)
    const { ok, data } = await action()
    if (ok) await refresh()
    setBusy(null)
    setConfirming(null)
    setNotice(ok ? (success ? { ok: true, text: success } : null) : { ok: false, text: data.message ?? t.failed })
    return ok
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (await run("invite", () => send("/api/team", "POST", { email: address, role }), format(t.sent, { email: address.toLowerCase() }))) setEmail("")
  }

  const switchWorkspace = async (organizationId: string) => {
    setBusy("workspace")
    const { ok, data } = await send("/api/team/workspace", "POST", { organizationId })
    // the whole dashboard follows the workspace, so load it fresh
    if (ok) return window.location.assign("/dashboard/team")
    setBusy(null)
    setNotice({ ok: false, text: data.message ?? t.failed })
  }

  const leave = async () => {
    setBusy(`remove-${me}`)
    const { ok, data } = await send(`/api/team/members/${me}`, "DELETE")
    if (ok) return window.location.assign("/dashboard")
    setBusy(null)
    setConfirming(null)
    setNotice({ ok: false, text: data.message ?? t.failed })
  }

  const canRemove = (m: Member) => m.userId !== me && (isOwner || (team.role === "admin" && m.role === "member"))
  // the last owner keeps the role, so the workspace always has one
  const canChangeRole = (m: Member) => isOwner && !(m.role === "owner" && owners === 1)

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <h1 className="m-0 text-lg font-semibold">{t.title}</h1>
        <p className="m-0 text-xs text-[var(--color-muted)]">{format(t.lede, { workspace: team.workspace.name })}</p>
      </header>

      <div className="flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        {team.workspaces.length > 1 && (
          <section className={card}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t.workspace}
              <select
                value={team.workspace.id}
                disabled={busy === "workspace"}
                onChange={(e) => switchWorkspace(e.target.value)}
                className={`${input} w-full max-w-sm cursor-pointer font-normal`}
              >
                {team.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {t.roles[w.role]}
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-sm text-[var(--color-muted)]">{t.workspaceHint}</p>
          </section>
        )}

        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={notice.ok ? okText : errorText}>
            {notice.text}
          </p>
        )}

        <section className={card}>
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-base font-semibold">{t.members}</h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">{t.roleHelp}</p>
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--color-line)] p-0">
            {team.members.map((m) => (
              <li key={m.userId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {m.name}
                      {m.userId === me && <span className="font-normal text-[var(--color-muted)]"> ({t.you})</span>}
                    </span>
                    <span className="truncate text-sm text-[var(--color-muted)]">{m.email}</span>
                  </div>
                  {canChangeRole(m) ? (
                    <select
                      aria-label={format(t.roleOf, { name: m.name })}
                      value={m.role}
                      disabled={!!busy}
                      onChange={(e) => run(`role-${m.userId}`, () => send(`/api/team/members/${m.userId}`, "PATCH", { role: e.target.value }))}
                      className={`${input} cursor-pointer`}
                    >
                      {(["owner", "admin", "member"] as MemberRole[]).map((r) => (
                        <option key={r} value={r}>
                          {t.roles[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-[var(--color-bubble)] px-2.5 py-0.5 text-xs font-semibold">{t.roles[m.role]}</span>
                  )}
                  {canRemove(m) && (
                    <button type="button" disabled={!!busy} onClick={() => setConfirming(m.userId)} className={secondary}>
                      {t.remove}
                    </button>
                  )}
                  {m.userId === me && team.workspaces.length > 1 && (
                    <button type="button" disabled={!!busy} onClick={() => setConfirming(me)} className={secondary}>
                      {t.leave}
                    </button>
                  )}
                </div>
                {confirming === m.userId && (
                  <div role="group" className="flex flex-col gap-3 rounded-xl bg-[var(--color-bubble)] p-4">
                    <p className="m-0 text-sm">
                      {m.userId === me
                        ? format(t.leaveConfirm, { workspace: team.workspace.name })
                        : format(t.removeConfirm, { name: m.name, workspace: team.workspace.name })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          m.userId === me
                            ? leave()
                            : run(`remove-${m.userId}`, () => send(`/api/team/members/${m.userId}`, "DELETE"), format(t.removed, { name: m.name }))
                        }
                        className={danger}
                      >
                        {busy === `remove-${m.userId}` && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                        {m.userId === me ? t.confirmLeave : t.confirmRemove}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => setConfirming(null)} className={secondary}>
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-base font-semibold">{t.invite}</h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">{canInvite ? t.inviteHint : t.inviteReadOnly}</p>
          </div>
          {canInvite && (
            <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm font-medium">
                {t.email}
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} className={input} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.role}
                <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")} className={`${input} cursor-pointer`}>
                  <option value="member">{t.roles.member}</option>
                  {isOwner && <option value="admin">{t.roles.admin}</option>}
                </select>
              </label>
              <button type="submit" disabled={!!busy || !email.trim()} className={primary}>
                {busy === "invite" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {t.send}
              </button>
            </form>
          )}
        </section>

        {team.invites.length > 0 && (
          <section className={card}>
            <h2 className="m-0 text-base font-semibold">{t.pending}</h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--color-line)] p-0">
              {team.invites.map(inviteRow)}
            </ul>
          </section>
        )}
      </div>
    </div>
  )

  function inviteRow(invite: Invite) {
    const expired = new Date(invite.expiresAt).getTime() <= Date.now()
    // admins manage the member invitations; owners manage all
    const canManage = canInvite && (isOwner || invite.role === "member")
    return (
      <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{invite.email}</span>
          <span className="text-sm text-[var(--color-muted)]">
            {t.roles[invite.role]}
            {invite.invitedBy && ` · ${format(t.invitedBy, { name: invite.invitedBy })}`}
            {" · "}
            {expired ? (
              <span className="text-amber-600 dark:text-amber-400">{t.expired}</span>
            ) : (
              format(t.expires, { date: formatDate(invite.expiresAt, locale) })
            )}
          </span>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run(`resend-${invite.id}`, () => send("/api/team", "POST", { email: invite.email, role: invite.role }), format(t.sent, { email: invite.email }))}
              className={secondary}
            >
              {t.resend}
            </button>
            <button type="button" disabled={!!busy} onClick={() => run(`revoke-${invite.id}`, () => send(`/api/team/invites/${invite.id}`, "DELETE"))} className={secondary}>
              {t.revoke}
            </button>
          </div>
        )}
      </li>
    )
  }
}
