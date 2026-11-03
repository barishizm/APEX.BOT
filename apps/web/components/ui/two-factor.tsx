"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format, localizePath } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const input =
  "mt-2 h-12 w-full rounded-lg border bg-transparent px-4 font-mono text-lg tracking-[0.2em] text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/70"
const primary =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"

export default function TwoFactor({ next }: { next: string | null }) {
  const { t: app, locale } = useAppI18n()
  const a = app.account
  const t = a.twoStep
  const router = useRouter()
  const toLogin = localizePath("/login", locale)
  const [recovery, setRecovery] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recovery && !/^\d{6}$/.test(code)) return setError(t.codeInvalid)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/two-factor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      // the challenge timed out or was used up: start over
      if (res.status === 401) return router.replace(toLogin)
      if (!res.ok) {
        setBusy(false)
        return setError(data.message ?? a.generic)
      }
      const to = next ?? "/dashboard?welcome=1"
      if (data.usedRecoveryCode) {
        setNotice(format(t.recoveryUsed, { n: data.recoveryCodesLeft }))
        setTimeout(() => router.push(to), 3500)
      } else router.push(to)
    } catch {
      setBusy(false)
      setError(a.network)
    }
  }

  const toggle = () => {
    setRecovery((r) => !r)
    setCode("")
    setError(null)
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-3 text-[var(--color-text)]">
      <section className="flex w-full max-w-[34rem] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10">
        <Link href={localizePath("/", locale)} className="logo" aria-label={a.home}>
          <span className="logo__mark" />
        </Link>
        <form onSubmit={submit} noValidate className="py-10">
          <ShieldCheck className="h-10 w-10 text-[var(--color-muted)]" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-3 text-lg text-[var(--color-muted)]">{recovery ? t.recoveryLede : t.lede}</p>
          <label htmlFor="two-factor-code" className="mt-8 block text-sm font-medium">
            {recovery ? t.recoveryCode : t.code}
          </label>
          <input
            id="two-factor-code"
            key={String(recovery)}
            autoFocus
            autoComplete="one-time-code"
            inputMode={recovery ? "text" : "numeric"}
            maxLength={recovery ? 20 : 6}
            placeholder={recovery ? "xxxxx-xxxxx" : "000000"}
            value={code}
            onChange={(e) => {
              setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ""))
              setError(null)
            }}
            aria-invalid={!!error}
            className={cn(input, error ? "border-red-500" : "border-[var(--color-line)] focus:border-[var(--color-secondary)]")}
          />
          {error && (
            <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-2 text-sm text-green-800 dark:text-green-300">
              {notice}
            </p>
          )}
          <button
            type="button"
            onClick={toggle}
            className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-sm underline underline-offset-2 text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            {recovery ? t.useApp : t.useRecovery}
          </button>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy || !code.trim()} className={primary}>
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.submit}
            </button>
            <Link href={toLogin} className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:opacity-70">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t.back}
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
