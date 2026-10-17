"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { useSetLocale } from "@/components/i18n/use-set-locale"
import { Group, TextInput, Toggle } from "@/components/widget-studio/fields"
import { format, isLocale, LOCALE_META, LOCALES, localizePath } from "@/lib/i18n"
import { formatDate, plural } from "@/lib/i18n/format"

type Account = {
  username: string
  displayName: string
  email: string
  accountType: "personal" | "business"
  createdAt: string
  hasPassword: boolean
  providers: string[]
  otherSessions: number
  allowTraining: boolean
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; message: string } | { kind: "error"; message: string }

async function call(path: string, method: string, offline: string, body?: object) {
  try {
    const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { message: offline } }
  }
}

const primary =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
const ghost =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-40"

function StatusText({ status }: { status: Status }) {
  if (status.kind === "ok")
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
        <Check className="h-4 w-4" aria-hidden /> {status.message}
      </p>
    )
  if (status.kind === "error")
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {status.message}
      </p>
    )
  return null
}

const PROVIDER_NAME: Record<string, string> = { google: "Google", github: "GitHub" }

export function AccountSettings({ initial }: { initial: Account }) {
  const { t: app, locale } = useAppI18n()
  const t = app.settings
  const setLocale = useSetLocale()
  const send = (path: string, method: string, body?: object) => call(path, method, t.offline, body)
  const router = useRouter()
  const [account, setAccount] = useState(initial)
  const [username, setUsername] = useState(initial.username)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [profile, setProfile] = useState<Status>({ kind: "idle" })

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [password, setPassword] = useState<Status>({ kind: "idle" })

  const [sessions, setSessions] = useState<Status>({ kind: "idle" })
  const [training, setTraining] = useState<Status>({ kind: "idle" })

  const [deleting, setDeleting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [danger, setDanger] = useState<Status>({ kind: "idle" })

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfile({ kind: "busy" })
    const changes = {
      ...(username.trim() !== account.username && { username }),
      ...(displayName.trim() !== account.displayName && { displayName }),
    }
    const { ok, data } = await send("/api/account", "PATCH", changes)
    if (!ok) return setProfile({ kind: "error", message: data.message ?? t.couldntSave })
    setAccount((a) => ({ ...a, username: data.user.username, displayName: data.user.displayName ?? "" }))
    setDisplayName(data.user.displayName ?? "")
    setProfile({ kind: "ok", message: t.saved })
    router.refresh()
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return setPassword({ kind: "error", message: t.passwordShort })
    if (next !== confirm) return setPassword({ kind: "error", message: t.passwordMismatch })
    setPassword({ kind: "busy" })
    const { ok, data } = await send("/api/account/password", "POST", { current, next })
    if (!ok) return setPassword({ kind: "error", message: data.message ?? t.passwordFailed })
    setCurrent("")
    setNext("")
    setConfirm("")
    setAccount((a) => ({ ...a, hasPassword: true, otherSessions: 0 }))
    setPassword({ kind: "ok", message: data.signedOut ? plural(data.signedOut, t.passwordChangedSignedOut, locale) : t.passwordChanged })
  }

  const signOutOthers = async () => {
    setSessions({ kind: "busy" })
    const { ok, data } = await send("/api/account/sessions", "DELETE")
    if (!ok) return setSessions({ kind: "error", message: data.message ?? t.signOutFailed })
    setAccount((a) => ({ ...a, otherSessions: 0 }))
    setSessions({ kind: "ok", message: plural(data.signedOut, t.signedOut, locale) })
  }

  const setAllowTraining = async (allowTraining: boolean) => {
    setAccount((a) => ({ ...a, allowTraining }))
    setTraining({ kind: "busy" })
    const { ok, data } = await send("/api/account", "PATCH", { allowTraining })
    if (!ok) {
      setAccount((a) => ({ ...a, allowTraining: !allowTraining }))
      return setTraining({ kind: "error", message: data.message ?? t.couldntSave })
    }
    setTraining({ kind: "ok", message: t.saved })
  }

  const deleteNow = async () => {
    setDanger({ kind: "busy" })
    const { ok, data } = await send("/api/account", "DELETE", { confirmEmail })
    if (!ok) return setDanger({ kind: "error", message: data.message ?? t.deleteFailed })
    window.location.replace(localizePath("/", locale))
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="text-xs text-[var(--color-muted)]">
          {format(t.summary, {
            email: account.email,
            type: account.accountType === "business" ? t.business : t.personal,
            date: formatDate(account.createdAt, locale),
          })}
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        <Group title={t.profile}>
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <TextInput label={t.displayName} value={displayName} onChange={setDisplayName} hint={t.displayNameHint} />
            <TextInput label={t.username} value={username} onChange={setUsername} hint={t.usernameHint} />
            <TextInput label={t.email} value={account.email} onChange={() => {}} disabled hint={t.emailHint} />
            <div className="flex items-center gap-3">
              <button type="submit" className={primary} disabled={profile.kind === "busy" || (username.trim() === account.username && displayName.trim() === account.displayName)}>
                {profile.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                {t.save}
              </button>
              <StatusText status={profile} />
            </div>
          </form>
        </Group>

        <Group title={t.language} description={t.languageHint}>
          <select
            aria-label={t.language}
            value={locale}
            onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
            className="h-10 w-fit cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm outline-none focus:border-[var(--color-secondary)]"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l} lang={LOCALE_META[l].hreflang}>
                {LOCALE_META[l].name}
              </option>
            ))}
          </select>
        </Group>

        <Group
          title={account.hasPassword ? t.changePassword : t.setPasswordTitle}
          description={
            account.hasPassword
              ? t.changePasswordHint
              : format(t.setPasswordHint, { providers: account.providers.map((p) => PROVIDER_NAME[p] ?? p).join(t.or) })
          }
        >
          <form onSubmit={savePassword} className="flex flex-col gap-4">
            {/* hidden username helps password managers file the new password correctly */}
            <input type="text" name="username" autoComplete="username" value={account.email} readOnly hidden />
            {account.hasPassword && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.currentPassword}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm font-normal outline-none focus:border-[var(--color-secondary)]"
                />
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.newPassword}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder={t.passwordPlaceholder}
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm font-normal outline-none placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-secondary)]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t.confirmPassword}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm font-normal outline-none focus:border-[var(--color-secondary)]"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={primary} disabled={password.kind === "busy" || !next || (account.hasPassword && !current)}>
                {password.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                {account.hasPassword ? t.changePassword : t.setPassword}
              </button>
              <StatusText status={password} />
            </div>
          </form>
        </Group>

        <Group title={t.signIn} description={t.signInHint}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">{t.methods}</dt>
            <dd className="m-0">{[account.hasPassword && t.emailAndPassword, ...account.providers.map((p) => PROVIDER_NAME[p] ?? p)].filter(Boolean).join(", ")}</dd>
            <dt className="text-[var(--color-muted)]">{t.otherDevices}</dt>
            <dd className="m-0">{account.otherSessions === 0 ? t.noOtherDevices : format(t.devicesSignedIn, { n: account.otherSessions })}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={signOutOthers} className={ghost} disabled={account.otherSessions === 0 || sessions.kind === "busy"}>
              {sessions.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {t.signOutOthers}
            </button>
            <StatusText status={sessions} />
          </div>
        </Group>

        <Group title={t.privacy}>
          <Toggle
            label={t.training}
            description={t.trainingHint}
            checked={account.allowTraining}
            onChange={setAllowTraining}
            disabled={training.kind === "busy"}
          />
          <StatusText status={training} />
        </Group>

        <section className="flex flex-col gap-4 rounded-2xl border border-red-500/40 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{t.deleteTitle}</h2>
            <p className="text-sm text-[var(--color-muted)]">{t.deleteText}</p>
          </div>
          {!deleting ? (
            <button type="button" onClick={() => setDeleting(true)} className={`${ghost} border-red-500/50 text-red-600 hover:border-red-500 dark:text-red-400`}>
              {t.deleteStart}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {format(t.deleteConfirm, { email: account.email })}
                <input
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  autoComplete="off"
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 font-mono text-sm font-normal outline-none focus:border-red-500"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={deleteNow}
                  disabled={confirmEmail.trim().toLowerCase() !== account.email || danger.kind === "busy"}
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border-0 bg-red-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {danger.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                  {t.deleteNow}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleting(false)
                    setConfirmEmail("")
                    setDanger({ kind: "idle" })
                  }}
                  className={ghost}
                >
                  {t.cancel}
                </button>
                <StatusText status={danger} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
