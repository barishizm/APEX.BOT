"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

async function postJson(path: string, body: object) {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { message: "Couldn't reach the server. Check your connection and try again" } }
  }
}

const input =
  "mt-2 h-12 w-full rounded-lg border bg-transparent px-4 text-base text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/70"
const primary =
  "inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"

export default function ForgotPassword() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "code" | "done">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address")
    setBusy(true)
    setError(null)
    const { ok, data } = await postJson("/api/auth/forgot-password", { email })
    setBusy(false)
    if (!ok) return setError(data.message ?? "Something went wrong. Try again")
    setStep("code")
  }

  const reset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from the email")
    if (password.length < 8) return setError("Choose a password with at least 8 characters")
    setBusy(true)
    setError(null)
    const { ok, data } = await postJson("/api/auth/reset-password", { email, code, password })
    setBusy(false)
    if (!ok) return setError(data.message ?? "Something went wrong. Try again")
    setStep("done")
    setTimeout(() => router.push("/dashboard"), 1500)
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-3 text-[var(--color-text)]">
      <section className="flex w-full max-w-[34rem] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10">
        <Link href="/" className="logo" aria-label="Apex Bot home">
          <span className="logo__mark" />
        </Link>

        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="py-10">
          {step === "done" ? (
            <div role="status" className="flex flex-col items-start gap-4">
              <CircleCheck className="h-12 w-12 text-green-600" aria-hidden="true" />
              <h1 className="text-3xl font-semibold tracking-tight">Password updated</h1>
              <p className="text-lg text-[var(--color-muted)]">You're signed in. Other devices were signed out. Taking you to your dashboard…</p>
            </div>
          ) : step === "email" ? (
            <form onSubmit={requestCode} noValidate>
              <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
              <p className="mt-3 text-lg text-[var(--color-muted)]">Enter the email you signed up with and we'll send you a 6-digit code.</p>
              <label htmlFor="reset-email" className="mt-8 block text-sm font-medium">
                Email
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
                placeholder="jane@company.com"
                aria-invalid={!!error}
                className={cn(input, error ? "border-red-500" : "border-[var(--color-line)] focus:border-[var(--color-secondary)]")}
              />
              {error && (
                <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-500">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy} className={primary}>
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Send code
                </button>
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline hover:opacity-70">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to log in
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={reset} noValidate>
              <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-3 text-lg text-[var(--color-muted)]">
                If an account exists for <strong className="break-all text-[var(--color-text)]">{email.trim()}</strong>, we've sent it a code. It expires in 15
                minutes.
              </p>
              <label htmlFor="reset-code" className="mt-8 block text-sm font-medium">
                6-digit code
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
                New password
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
                placeholder="At least 8 characters"
                className={cn(input, "border-[var(--color-line)] focus:border-[var(--color-secondary)]")}
              />
              {error && (
                <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-500">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy} className={primary}>
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Set new password
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
                  Use a different email
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </section>
    </main>
  )
}
