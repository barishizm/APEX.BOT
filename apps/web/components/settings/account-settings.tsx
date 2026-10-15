"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Group, TextInput, Toggle } from "@/components/widget-studio/fields"

type Account = {
  username: string
  email: string
  accountType: "personal" | "business"
  createdAt: string
  hasPassword: boolean
  providers: string[]
  otherSessions: number
  allowTraining: boolean
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; message: string } | { kind: "error"; message: string }

async function call(path: string, method: string, body?: object) {
  try {
    const res = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { message: "You're offline. Check your connection and try again" } }
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
  const router = useRouter()
  const [account, setAccount] = useState(initial)
  const [username, setUsername] = useState(initial.username)
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
    const { ok, data } = await call("/api/account", "PATCH", { username })
    if (!ok) return setProfile({ kind: "error", message: data.message ?? "Couldn't save" })
    setAccount((a) => ({ ...a, username: data.user.username }))
    setProfile({ kind: "ok", message: "Saved" })
    router.refresh()
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return setPassword({ kind: "error", message: "Use at least 8 characters" })
    if (next !== confirm) return setPassword({ kind: "error", message: "The new passwords don't match" })
    setPassword({ kind: "busy" })
    const { ok, data } = await call("/api/account/password", "POST", { current, next })
    if (!ok) return setPassword({ kind: "error", message: data.message ?? "Couldn't change the password" })
    setCurrent("")
    setNext("")
    setConfirm("")
    setAccount((a) => ({ ...a, hasPassword: true, otherSessions: 0 }))
    setPassword({ kind: "ok", message: data.signedOut ? `Password changed. ${data.signedOut} other device${data.signedOut === 1 ? " was" : "s were"} signed out.` : "Password changed." })
  }

  const signOutOthers = async () => {
    setSessions({ kind: "busy" })
    const { ok, data } = await call("/api/account/sessions", "DELETE")
    if (!ok) return setSessions({ kind: "error", message: data.message ?? "Couldn't sign out other devices" })
    setAccount((a) => ({ ...a, otherSessions: 0 }))
    setSessions({ kind: "ok", message: `Signed out ${data.signedOut} device${data.signedOut === 1 ? "" : "s"}` })
  }

  const setAllowTraining = async (allowTraining: boolean) => {
    setAccount((a) => ({ ...a, allowTraining }))
    setTraining({ kind: "busy" })
    const { ok, data } = await call("/api/account", "PATCH", { allowTraining })
    if (!ok) {
      setAccount((a) => ({ ...a, allowTraining: !allowTraining }))
      return setTraining({ kind: "error", message: data.message ?? "Couldn't save" })
    }
    setTraining({ kind: "ok", message: "Saved" })
  }

  const deleteNow = async () => {
    setDanger({ kind: "busy" })
    const { ok, data } = await call("/api/account", "DELETE", { confirmEmail })
    if (!ok) return setDanger({ kind: "error", message: data.message ?? "Couldn't delete the account" })
    window.location.replace("/")
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <h1 className="text-lg font-semibold">Account settings</h1>
        <p className="text-xs text-[var(--color-muted)]">
          {account.email} · {account.accountType === "business" ? "Business" : "Personal"} account since{" "}
          {new Date(account.createdAt).toLocaleDateString("en", { dateStyle: "medium" })}
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        <Group title="Profile">
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <TextInput label="Username" value={username} onChange={setUsername} hint="3-32 letters, numbers, dots, dashes or underscores." />
            <TextInput label="Email" value={account.email} onChange={() => {}} disabled hint="Write to us if you need to change your account email." />
            <div className="flex items-center gap-3">
              <button type="submit" className={primary} disabled={profile.kind === "busy" || username.trim() === account.username}>
                {profile.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                Save
              </button>
              <StatusText status={profile} />
            </div>
          </form>
        </Group>

        <Group
          title={account.hasPassword ? "Change password" : "Set a password"}
          description={
            account.hasPassword
              ? "Other devices are signed out when you change it."
              : `You sign in with ${account.providers.map((p) => PROVIDER_NAME[p] ?? p).join(" or ")}. Add a password to also sign in with your email.`
          }
        >
          <form onSubmit={savePassword} className="flex flex-col gap-4">
            {/* hidden username helps password managers file the new password correctly */}
            <input type="text" name="username" autoComplete="username" value={account.email} readOnly hidden />
            {account.hasPassword && (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Current password
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
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm font-normal outline-none placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-secondary)]"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Confirm new password
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
                {account.hasPassword ? "Change password" : "Set password"}
              </button>
              <StatusText status={password} />
            </div>
          </form>
        </Group>

        <Group title="Sign-in" description="Where your account is signed in and how.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">Methods</dt>
            <dd className="m-0">{[account.hasPassword && "Email and password", ...account.providers.map((p) => PROVIDER_NAME[p] ?? p)].filter(Boolean).join(", ")}</dd>
            <dt className="text-[var(--color-muted)]">Other devices</dt>
            <dd className="m-0">{account.otherSessions === 0 ? "None. Only this browser is signed in." : `${account.otherSessions} signed in`}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={signOutOthers} className={ghost} disabled={account.otherSessions === 0 || sessions.kind === "busy"}>
              {sessions.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              Sign out other devices
            </button>
            <StatusText status={sessions} />
          </div>
        </Group>

        <Group title="Privacy">
          <Toggle
            label="Help improve Apex"
            description="Allow Apex to use your bots and conversations to improve its models. Optional, and off unless you choose it."
            checked={account.allowTraining}
            onChange={setAllowTraining}
            disabled={training.kind === "busy"}
          />
          <StatusText status={training} />
        </Group>

        <section className="flex flex-col gap-4 rounded-2xl border border-red-500/40 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Delete account</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Permanently deletes your account, and the workspaces where you're the only member: their assistant, knowledge and settings. The widget stops
              working on your website. This can't be undone.
            </p>
          </div>
          {!deleting ? (
            <button type="button" onClick={() => setDeleting(true)} className={`${ghost} border-red-500/50 text-red-600 hover:border-red-500 dark:text-red-400`}>
              Delete my account
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Type {account.email} to confirm
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
                  Delete permanently
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
                  Cancel
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
