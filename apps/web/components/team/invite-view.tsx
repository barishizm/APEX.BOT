"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlert, CircleCheck, LoaderCircle, Users } from "lucide-react"
import type { Invitation } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format, localizePath } from "@/lib/i18n"

const primary =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] no-underline transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
const secondary =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] bg-transparent px-7 text-[0.9375rem] font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]"

export default function InviteView({
  token,
  invitation,
  viewer,
}: {
  token: string
  invitation: Invitation | null
  viewer: { email: string; verified: boolean } | null
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.team.link
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)
  const next = `?next=${encodeURIComponent(`/invite/${token}`)}`

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBusy(false)
        return setError(data.message ?? app.account.generic)
      }
      setJoined(true)
      setTimeout(() => router.push("/dashboard"), 1500)
    } catch {
      setBusy(false)
      setError(app.account.network)
    }
  }

  const logOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    window.location.reload()
  }

  let body: React.ReactNode
  if (!invitation || invitation.status !== "open") {
    const [title, text] =
      !invitation ? [t.invalidTitle, t.invalidText] : invitation.status === "expired" ? [t.expiredTitle, t.expiredText] : [t.acceptedTitle, t.acceptedText]
    body = (
      <>
        <CircleAlert className="h-10 w-10 text-[var(--color-muted)]" aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-lg text-[var(--color-muted)]">{text}</p>
        {viewer && (
          <div className="mt-8">
            <Link href="/dashboard" className={primary}>
              {t.toDashboard}
            </Link>
          </div>
        )}
      </>
    )
  } else {
    const vars = { workspace: invitation.workspaceName, inviter: invitation.invitedBy ?? "", role: app.team.roles[invitation.role].toLowerCase() }
    const sameAccount = viewer?.email === invitation.email
    body = joined ? (
      <div role="status">
        <CircleCheck className="h-12 w-12 text-green-600" aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{format(t.title, vars)}</h1>
        <p className="mt-3 text-lg text-[var(--color-muted)]">{format(t.joined, vars)}</p>
      </div>
    ) : (
      <>
        <Users className="h-10 w-10 text-[var(--color-muted)]" aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{format(t.title, vars)}</h1>
        <p className="mt-3 text-lg text-[var(--color-muted)]">{format(invitation.invitedBy ? t.lede : t.ledeAnonymous, vars)}</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{format(t.forEmail, { email: invitation.email })}</p>

        {error && (
          <p role="alert" className="mt-6 flex items-center gap-2 text-sm text-red-500">
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {!viewer ? (
            <>
              <a href={localizePath("/login", locale) + next} className={primary}>
                {t.logIn}
              </a>
              <a href={localizePath("/signup", locale) + next} className={secondary}>
                {t.signUp}
              </a>
            </>
          ) : !sameAccount ? (
            <>
              <p className="w-full text-sm">{format(t.wrongAccount, { email: viewer.email, invited: invitation.email })}</p>
              <button type="button" onClick={logOut} className={secondary}>
                {t.logOut}
              </button>
            </>
          ) : !viewer.verified ? (
            <Link href={`/verify-email${next}`} className={primary}>
              {t.verifyFirst}
            </Link>
          ) : (
            <button type="button" onClick={accept} disabled={busy} className={primary}>
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.accept}
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-3 text-[var(--color-text)]">
      <section className="flex w-full max-w-[34rem] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10">
        <Link href={localizePath("/", locale)} className="logo" aria-label={app.account.home}>
          <span className="logo__mark" />
        </Link>
        <div className="py-10">{body}</div>
      </section>
    </main>
  )
}
