"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowUp, CircleAlert, CircleCheck, LoaderCircle, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const BENEFITS = [
  "Create AI Agent",
  "Simplify installation process",
  "Use website as knowledge",
  "Set language",
  "Style widget",
]

// Accepts "example.com", "www.example.com/path" or a full http(s) URL
function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return url.hostname.includes(".") && !url.hostname.endsWith(".") ? url.href : null
  } catch {
    return null
  }
}

export default function Onboarding() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [url, setUrl] = useState("")
  const [touched, setTouched] = useState(false)

  const normalized = normalizeUrl(url)
  const error = touched && !normalized
    ? url.trim()
      ? "Enter a valid website URL, like www.example.com"
      : "Enter your website URL to customize your setup"
    : null

  const finish = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!normalized) return
    try {
      sessionStorage.setItem("apex:onboarding:url", normalized)
    } catch {}
    setRunning(true)
  }

  // Tick the checklist one item at a time, then head to the app
  useEffect(() => {
    if (!running) return
    const t = setTimeout(
      () => (done < BENEFITS.length ? setDone(done + 1) : router.push("/dashboard?welcome=1")),
      done < BENEFITS.length ? 800 : 600
    )
    return () => clearTimeout(t)
  }, [running, done, router])

  return (
    <main
      id="main"
      className="grid min-h-screen gap-3 bg-[var(--color-surface)] p-3 text-[var(--color-text)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <section className="relative flex min-h-[calc(100vh-24px)] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10 lg:px-12">
        <Link href="/" className="logo" aria-label="Apex Bot home">
          <span className="logo__mark" />
        </Link>

        <div className="flex flex-1 items-center">
          <motion.form
            onSubmit={finish}
            noValidate
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto w-full max-w-[30rem] py-12"
          >
            <h1 className="text-[clamp(2rem,3.2vw,2.75rem)] font-semibold leading-[1.1] tracking-tight">
              Confirm your website
              <br />
              for a quick start
            </h1>
            <p style={{ marginTop: 20 }} className="text-lg leading-relaxed text-[var(--color-muted)]">
              Apex will learn your products, policies, and tone in seconds. It stays private until you launch it.
            </p>

            <label htmlFor="website-url" className="mt-10 block text-sm font-medium">
              Your website URL
            </label>
            <input
              id="website-url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoFocus
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
                  readOnly={running}
              onBlur={() => setTouched(true)}
              placeholder="www.example-website.com"
              aria-invalid={!!error}
              aria-describedby={error ? "website-url-error" : undefined}
              className={cn(
                "mt-2 h-14 w-full rounded-lg border bg-transparent px-4 text-base text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/70",
                error
                  ? "border-red-500"
                  : "border-[var(--color-line)] focus:border-[var(--color-secondary)]"
              )}
            />
            {error && (
              <p id="website-url-error" role="alert" style={{ marginTop: 8 }} className="flex items-center gap-2 text-sm text-red-500">
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <ul style={{ marginTop: 28 }} className="flex flex-wrap gap-x-4 gap-y-2.5 text-[0.9375rem] text-[var(--color-muted)]">
              {BENEFITS.map((b, i) => (
                <li key={b} className="flex items-center gap-2">
                  {running && i < done ? (
                    <CircleCheck className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
                  ) : running && i === done ? (
                    <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <CircleCheck className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                  )}
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-center gap-3">
              <button
                type="submit"
                disabled={!normalized || running}
                className="h-12 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-[var(--color-bubble)] disabled:text-[var(--color-muted)] disabled:opacity-100"
              >
                {running ? "Setting up..." : "Finish"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                disabled={running}
                className="h-12 cursor-pointer rounded-lg border-0 bg-transparent px-5 text-[0.9375rem] font-semibold text-[var(--color-text)] transition-opacity hover:opacity-70"
              >
                Skip
              </button>
            </div>
          </motion.form>
        </div>
      </section>

      <WidgetPreview />
    </main>
  )
}

export function WidgetPreview() {
  return (
    <aside
      aria-label="Widget preview"
      className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden rounded-2xl bg-[var(--color-secondary)] p-8 lg:flex"
    >
      {/* soft light blobs, same indigo family as the brand accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 45% at 25% 20%, color-mix(in srgb, var(--color-on-primary) 18%, transparent), transparent 70%), radial-gradient(55% 40% at 80% 85%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 70%)",
        }}
      />

      <span className="relative rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[0.9375rem] text-[var(--color-on-primary)]">
        Website widget preview
      </span>

      <div className="relative flex w-full max-w-[24rem] flex-col rounded-[28px] bg-[var(--color-surface)] p-5 shadow-2xl">
        <div className="mx-auto flex items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] py-1.5 pl-1.5 pr-4">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[var(--color-on-primary)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-raised)] bg-green-500" />
          </span>
          <span className="text-sm font-semibold">Apex Assistant</span>
        </div>

        <div className="mt-5 space-y-3">
          <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--color-bubble)] px-4 py-3 text-sm leading-snug">
            Yes. If the bag is unopened, you can return it free of charge within 14 days of delivery.
          </p>
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-primary)] px-4 py-3 text-sm leading-snug text-[var(--color-on-primary)]">
            It looks great. Thanks!
          </p>
          <p className="text-right text-xs text-[var(--color-muted)]">Read</p>
        </div>

        <div className="mt-10 flex items-center gap-3 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] p-1.5 pl-2">
          <span className="flex h-9 w-9 items-center justify-center text-[var(--color-muted)]">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm text-[var(--color-muted)]">Write a message...</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bubble)] text-[var(--color-muted)]">
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </aside>
  )
}
