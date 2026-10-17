"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Check, CircleAlert, Inbox, LoaderCircle, Mail, Sparkles } from "lucide-react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format, localizePath } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const CODE_LENGTH = 6
const RESEND_SECONDS = 30

async function postJson(path: string, body: object, networkError: string): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, status: 0, data: { message: networkError } }
  }
}

// `next` is an invitation link to return to once verified; otherwise onboarding comes next
export default function VerifyEmail({ initialEmail, next }: { initialEmail: string; next?: string | null }) {
  const { t: app, locale } = useAppI18n()
  const a = app.account
  const t = a.verify
  const toLogin = localizePath("/login", locale)
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""))
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const code = digits.join("")

  const setAt = (i: number, value: string) => {
    setError(null)
    setNotice(null)
    setDigits((d) => d.map((x, idx) => (idx === i ? value : x)))
  }

  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "")
    if (!v) return setAt(i, "")
    setAt(i, v.slice(-1))
    if (i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus()
  }

  const onKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus()
    if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH)
    if (!pasted) return
    e.preventDefault()
    setError(null)
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? ""))
    inputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < CODE_LENGTH) {
      setError(t.enterCode)
      return
    }
    setVerifying(true)
    const { ok, status, data } = await postJson("/api/auth/verify-email", { code }, a.network)
    setVerifying(false)
    if (status === 401) return router.replace(toLogin)
    if (!ok) {
      setError(data.message ?? a.generic)
      setShakeKey((k) => k + 1)
      return
    }
    setVerified(true)
    setTimeout(() => router.push(next ?? "/onboarding"), 3000)
  }

  const startEdit = () => {
    setDraft(email)
    setEmailError(null)
    setEditing(true)
  }

  const saveEmail = async () => {
    const next = draft.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailError(a.invalidEmail)
      return
    }
    setSaving(true)
    const { ok, status, data } = await postJson("/api/auth/resend-code", { email: next }, a.network)
    setSaving(false)
    if (status === 401) return router.replace(toLogin)
    if (!ok) {
      setEmailError(data.message ?? a.generic)
      return
    }
    setEmail(data.email)
    setEditing(false)
    setDigits(Array(CODE_LENGTH).fill(""))
    setError(null)
    setNotice(format(t.newCodeTo, { email: data.email }))
    setCooldown(RESEND_SECONDS)
    inputs.current[0]?.focus()
  }

  const resend = async () => {
    if (cooldown > 0) return
    const { ok, status, data } = await postJson("/api/auth/resend-code", {}, a.network)
    if (status === 401) return router.replace(toLogin)
    if (!ok) {
      setError(data.message ?? a.generic)
      return
    }
    setDigits(Array(CODE_LENGTH).fill(""))
    setError(null)
    setNotice(t.newCode)
    setCooldown(RESEND_SECONDS)
    inputs.current[0]?.focus()
  }

  return (
    <main
      id="main"
      className="grid min-h-screen gap-3 bg-[var(--color-surface)] p-3 text-[var(--color-text)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <section className="relative flex min-h-[calc(100vh-24px)] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10 lg:px-12">
        <Link href={localizePath("/", locale)} className="logo" aria-label={a.home}>
          <span className="logo__mark" />
        </Link>

        <div className="flex flex-1 items-center">
          <motion.form
            onSubmit={submit}
            noValidate
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto w-full max-w-[30rem] py-12"
          >
            {verified ? (
              <div className="flex flex-col items-center text-center" role="status">
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500"
                >
                  <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <motion.path
                      d="M5 12.5l4.5 4.5L19 7.5"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.25, duration: 0.45, ease: "easeOut" }}
                    />
                  </svg>
                </motion.span>
                <motion.h1
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.3 }}
                  style={{ marginTop: 28 }}
                  className="text-[clamp(2rem,3.2vw,2.75rem)] font-semibold leading-[1.1] tracking-tight"
                >
                  {t.verified}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.65 }}
                  style={{ marginTop: 16 }}
                  className="whitespace-nowrap text-lg text-[var(--color-muted)]"
                >
                  {t.next}
                </motion.p>
              </div>
            ) : (
              <>
            <h1 className="text-[clamp(2rem,3.2vw,2.75rem)] font-semibold leading-[1.1] tracking-tight">
              {t.checkEmail}
            </h1>
            <p className="mt-4 text-lg leading-snug text-[var(--color-muted)]">
              {t.sentTo}
            </p>
            {editing ? (
              <div className="mt-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setEmailError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        saveEmail()
                      }
                      if (e.key === "Escape") setEditing(false)
                    }}
                    autoFocus
                    aria-label={t.emailLabel}
                    aria-invalid={!!emailError}
                    className={cn(
                      "h-11 min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-base text-[var(--color-text)] outline-none transition-colors",
                      emailError ? "border-red-500" : "border-[var(--color-line)] focus:border-[var(--color-secondary)]"
                    )}
                  />
                  <button
                    type="button"
                    onClick={saveEmail}
                    disabled={saving}
                    className="h-11 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
                  >
                    {saving ? t.sending : t.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="h-11 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-sm font-semibold text-[var(--color-muted)] transition-opacity hover:opacity-70"
                  >
                    {t.cancel}
                  </button>
                </div>
                {emailError && (
                  <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-500">
                    <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {emailError}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="break-all text-lg font-medium leading-snug">{email || t.yourEmail}</span>
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={verifying}
                  className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-[var(--color-secondary)] underline underline-offset-4 transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.change}
                </button>
              </div>
            )}

            <motion.div
              key={shakeKey}
              animate={shakeKey ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : undefined}
              transition={{ duration: 0.5 }}
              className="mt-10 flex gap-2.5 sm:gap-3"
              onPaste={onPaste}
            >
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el
                  }}
                  value={d}
                  onChange={(e) => onChange(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  autoFocus={i === 0}
                  maxLength={1}
                  readOnly={verifying}
                  aria-label={format(t.digit, { n: i + 1 })}
                  aria-invalid={!!error}
                  className={cn(
                    "h-14 w-full min-w-0 rounded-lg border bg-transparent text-center text-2xl font-semibold text-[var(--color-text)] outline-none transition-colors",
                    error ? "border-red-500 bg-red-500/10 shadow-[0_0_0_3px_rgb(239_68_68/0.25)]" : "border-[var(--color-line)] focus:border-[var(--color-secondary)]"
                  )}
                />
              ))}
            </motion.div>
            {notice && !error && (
              <p role="status" style={{ marginTop: 20 }} className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" style={{ marginTop: 20 }} className="flex items-center gap-2 text-sm text-red-500">
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button
                type="submit"
                disabled={code.length < CODE_LENGTH || verifying}
                className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-[var(--color-bubble)] disabled:text-[var(--color-muted)] disabled:opacity-100"
              >
                {verifying && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {verifying ? t.verifying : t.verify}
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0 || verifying}
                className="h-12 cursor-pointer rounded-lg border-0 bg-transparent px-5 text-[0.9375rem] font-semibold text-[var(--color-text)] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:hover:opacity-100"
              >
                {cooldown > 0 ? format(t.resendIn, { s: cooldown }) : t.resend}
              </button>
            </div>
              </>
            )}
          </motion.form>
        </div>
      </section>

      <MailPreview />
    </main>
  )
}

const DEMO_CODE = "482915"
// 0 empty inbox, 1 new mail arrives, 2 mail opened, 3-8 one digit typed per step, 9 verified
const PHASE_DELAYS = [900, 1500, 1500, 280, 280, 280, 280, 280, 700, 2600]
const LAST_PHASE = PHASE_DELAYS.length - 1

// A mail app receives the code, opens it and types it into the verify form, then it loops
function MailPreview() {
  const { t: app } = useAppI18n()
  const t = app.account.verify
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const t = setTimeout(() => setPhase((p) => (p + 1) % PHASE_DELAYS.length), PHASE_DELAYS[phase])
    return () => clearTimeout(t)
  }, [phase, reduceMotion])

  const p = reduceMotion ? LAST_PHASE : phase
  const opened = p >= 2
  const typed = Math.min(Math.max(p - 2, 0), CODE_LENGTH)
  const verified = p === LAST_PHASE

  return (
    <aside
      aria-label={t.preview.label}
      className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden rounded-2xl bg-[var(--color-secondary)] p-8 lg:flex"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 45% at 25% 20%, color-mix(in srgb, var(--color-on-primary) 18%, transparent), transparent 70%), radial-gradient(55% 40% at 80% 85%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 70%)",
        }}
      />

      <div
        aria-hidden="true"
        className="relative w-full max-w-[24rem] overflow-hidden rounded-[22px] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl"
      >
        {/* window chrome */}
        <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-line)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-line)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-line)]" />
          </div>
          <div className="flex flex-1 items-center gap-2 text-xs font-medium text-[var(--color-muted)]">
            {opened ? <ArrowLeft className="h-3.5 w-3.5" /> : <Inbox className="h-3.5 w-3.5" />}
            {opened ? t.preview.message : t.preview.inbox}
          </div>
          <Mail className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        </div>

        <div className="relative h-[19rem]">
          <AnimatePresence initial={false} mode="popLayout">
            {!opened ? (
              <motion.ul
                key="inbox"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="absolute inset-0 list-none p-2"
              >
                <AnimatePresence initial={false}>
                  {p >= 1 && (
                    <motion.li
                      key="new"
                      initial={{ opacity: 0, height: 0, y: -12 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-3 rounded-xl bg-[var(--color-raised)] px-3 py-3">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[var(--color-on-primary)]">
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1 text-sm leading-tight">
                          <div className="flex justify-between gap-2">
                            <span className="font-semibold">Apex Bot</span>
                            <span className="text-xs text-[var(--color-muted)]">{t.preview.now}</span>
                          </div>
                          <p className="truncate text-xs text-[var(--color-muted)]">{t.preview.subject}</p>
                        </div>
                      </div>
                    </motion.li>
                  )}
                </AnimatePresence>
                {[0.55, 0.7, 0.45, 0.6].map((w, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-3 pl-8">
                    <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--color-bubble)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 rounded-full bg-[var(--color-line)]" style={{ width: `${w * 100}%` }} />
                      <div className="h-1.5 w-4/5 rounded-full bg-[var(--color-bubble)]" />
                    </div>
                  </li>
                ))}
              </motion.ul>
            ) : (
              <motion.div
                key="message"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="absolute inset-0 flex flex-col p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[var(--color-on-primary)]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="text-sm leading-tight">
                    <p className="font-semibold">{t.preview.subject}</p>
                    <p className="text-xs text-[var(--color-muted)]">Apex Bot · {t.preview.now}</p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-[var(--color-muted)]">{t.preview.useCode}</p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.35em]">{DEMO_CODE}</p>

                {/* the verify form the code gets typed into */}
                <div className="mt-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
                  <div className="flex gap-1.5">
                    {DEMO_CODE.split("").map((digit, i) => (
                      <span
                        key={i}
                        className={cn(
                          "relative flex h-10 flex-1 items-center justify-center rounded-md border text-base font-semibold transition-colors",
                          verified
                            ? "border-[var(--color-secondary)]"
                            : i === typed
                              ? "border-[var(--color-secondary)]"
                              : "border-[var(--color-line)]"
                        )}
                      >
                        {i < typed && (
                          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                            {digit}
                          </motion.span>
                        )}
                        {i === typed && !verified && (
                          <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 0.9, repeat: Infinity }}
                            className="h-4 w-px bg-[var(--color-text)]"
                          />
                        )}
                      </span>
                    ))}
                  </div>
                  <div
                    className={cn(
                      "mt-2.5 flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors duration-300",
                      verified
                        ? "bg-[var(--color-secondary)] text-[var(--color-on-primary)]"
                        : typed === CODE_LENGTH
                          ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                          : "bg-[var(--color-bubble)] text-[var(--color-muted)]"
                    )}
                  >
                    {verified ? (
                      <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" /> {t.verified}
                      </motion.span>
                    ) : (
                      t.verify
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  )
}
