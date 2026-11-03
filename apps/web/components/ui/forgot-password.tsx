"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { localizePath } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Turnstile, TURNSTILE_SITE_KEY } from "@/components/ui/turnstile"

async function postJson(path: string, body: object, networkError: string) {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { message: networkError } }
  }
}

const input =
  "mt-2 h-12 w-full rounded-lg border bg-transparent px-4 text-base text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/70"
const primary =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"

export default function ForgotPassword() {
  const { t: app, locale } = useAppI18n()
  const a = app.account
  const t = a.reset
  const router = useRouter()
  const [step, setStep] = useState<"email" | "code" | "done">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [humanToken, setHumanToken] = useState<string | null>(null)
  const [humanReset, setHumanReset] = useState(0)

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(a.invalidEmail)
    if (TURNSTILE_SITE_KEY && !humanToken) return setError(a.generic)
    setBusy(true)
    setError(null)
    const { ok, data } = await postJson("/api/auth/forgot-password", { email, turnstileToken: humanToken }, a.network)
    setBusy(false)
    setHumanReset((n) => n + 1)
    if (!ok) return setError(data.message ?? a.generic)
    setStep("code")
  }

  const reset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) return setError(t.codeInvalid)
    if (password.length < 8) return setError(t.passwordShort)
    setBusy(true)
    setError(null)
    const { ok, data } = await postJson("/api/auth/reset-password", { email, code, password }, a.network)
    setBusy(false)
    if (!ok) return setError(data.message ?? a.generic)
    // the new password is set; two-step sign-in still asks for the authenticator code
    if (data.twoFactor) return router.push("/two-factor")
    setStep("done")
    setTimeout(() => router.push("/dashboard"), 1500)
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-3 text-[var(--color-text)]">
      <section className="flex w-full max-w-[34rem] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10">
        <Link href={localizePath("/", locale)} className="logo" aria-label={a.home}>
          <span className="logo__mark" />
        </Link>

        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="py-10">
          {step === "done" ? (
            <div role="status" className="flex flex-col items-start gap-4">
              <CircleCheck className="h-12 w-12 text-green-800 dark:text-green-300" aria-hidden="true" />
              <h1 className="text-3xl font-semibold tracking-tight">{t.doneTitle}</h1>
              <p className="text-lg text-[var(--color-muted)]">{t.doneText}</p>
            </div>
          ) : step === "email" ? (
            <form onSubmit={requestCode} noValidate>
              <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
              <p className="mt-3 text-lg text-[var(--color-muted)]">{t.lede}</p>
              <label htmlFor="reset-email" className="mt-8 block text-sm font-medium">
                {t.email}
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                placeholder={t.emailPlaceholder}
                aria-invalid={!!error}
                className={cn(input, error ? "border-red-500" : "border-[var(--color-line)] focus:border-[var(--color-secondary)]")}
              />
              {error && (
                <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <div className="mt-6">
                <Turnstile onToken={setHumanToken} resetKey={humanReset} />
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy} className={primary}>
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.sendCode}
                </button>
                <Link href={localizePath("/login", locale)} className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:opacity-70">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t.back}
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={reset} noValidate>
              <h1 className="text-3xl font-semibold tracking-tight">{t.checkEmail}</h1>
              <p className="mt-3 text-lg text-[var(--color-muted)]">
                {t.sentPre} <strong className="break-all text-[var(--color-text)]">{email.trim()}</strong>
                {t.sentPost}
              </p>
              <label htmlFor="reset-code" className="mt-8 block text-sm font-medium">
                {t.code}
              </label>
              <input
                id="reset-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""))
                  setError(null)
                }}
                placeholder="123456"
                className={cn(input, "font-mono tracking-[0.3em]", "border-[var(--color-line)] focus:border-[var(--color-secondary)]")}
              />
              <label htmlFor="reset-password" className="mt-5 block text-sm font-medium">
                {t.newPassword}
              </label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                placeholder={t.passwordPlaceholder}
                className={cn(input, "border-[var(--color-line)] focus:border-[var(--color-secondary)]")}
              />
              {error && (
                <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy} className={primary}>
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.submit}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email")
                    setCode("")
                    setError(null)
                  }}
                  className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-[var(--color-text)] hover:opacity-70"
                >
                  {t.differentEmail}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </section>
    </main>
  )
}
