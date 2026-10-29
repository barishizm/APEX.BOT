"use client"

import { useState, useEffect, useRef } from "react"
import { Turnstile, TURNSTILE_SITE_KEY } from "@/components/ui/turnstile"
import { useRouter } from "next/navigation"
import { X, Check, ArrowRight, Clock, Languages, LifeBuoy, Eye, EyeOff } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import dynamic from "next/dynamic"
import { useI18n } from "@/components/i18n/provider"
import { format } from "@/lib/i18n"
import { inviteTokenFromPath, safeNextPath } from "@/lib/next-path"
import { useSignedIn } from "@/lib/signed-in"

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function GitHubLogo() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function SocialButtons({ verb, accountType, next }: { verb: string; accountType?: "business" | "personal"; next?: string | null }) {
  const { t, href } = useI18n()
  return (
    <>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        {t.auth.or}
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>

      <div className="space-y-2">
        {[
          { name: "Google", slug: "google", logo: <GoogleLogo /> },
          { name: "GitHub", slug: "github", logo: <GitHubLogo /> },
        ].map(({ name, slug, logo }) => (
          <a
            key={name}
            href={`/api/auth/oauth/${slug}?${new URLSearchParams({ ...(accountType && { type: accountType }), ...(next && { next }) })}`}
            className="w-full flex items-center justify-center gap-3 px-8 py-2.5 rounded-lg border border-zinc-300 dark:border-white/20 bg-white dark:bg-zinc-950 text-sm font-medium text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 transition-colors cursor-pointer"
          >
            {logo}
            {format(t.auth.withProvider, { verb, provider: name })}
          </a>
        ))}
      </div>
      {accountType && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          {t.auth.oauthConsentPre}{" "}
          <a href={href("/terms")} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t.nav.terms}</a> {t.auth.and}{" "}
          <a href={href("/privacy")} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t.nav.privacy}</a>.
        </p>
      )}
    </>
  )
}

// Stop password-manager extensions (Proton Pass, 1Password, LastPass, Bitwarden)
// from injecting their icon/outline into the auth fields.
const noExtensionUi = {
  "data-protonpass-ignore": "true",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": "true",
} as const

// The reveal button sits beside the input (not over it), so password-manager
// icons injected at the input's right edge (Proton Pass etc.) can't cover it.
function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex items-center rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 focus-within:border-zinc-500 dark:focus-within:border-white/40 transition-all">
      <input
        {...props}
        {...noExtensionUi}
        style={{ outline: "none", boxShadow: "none" }}
        type={visible ? "text" : "password"}
        className="min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent shadow-none px-4 py-2.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none"
      />
      <button
        type="button"
        aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
        aria-pressed={visible}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="relative z-10 mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// The sign-up card's moving gradient is WebGL; its code loads only when the card opens.
const MeshGradient = dynamic(() => import("@/components/ui/mesh-gradient").then((m) => m.MeshGradient), { ssr: false })

// That gradient is soft enough to draw at a fraction of the screen's pixels
// and scale up: the shader's cost is per pixel, and the visitor is typing on top of it.
const MESH_PIXELS = 480 * 270

export default function Hero({
  modalOnly = false,
  initialAuth,
}: {
  modalOnly?: boolean
  // set by the /login and /signup routes to open the modal on load
  initialAuth?: "login" | "register"
}) {
  const { t, href } = useI18n()
  const signedIn = useSignedIn()
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  // Focus goes back where it was when the modal closes
  const returnFocus = useRef<HTMLElement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [meshReady, setMeshReady] = useState(false)
  const reduceMotion = useReducedMotion()
  const [accountType, setAccountType] = useState<"business" | "personal">("business")
  const isBusiness = accountType === "business"
  const [formStep, setFormStep] = useState<"idle" | "submitting" | "success">("idle")
  const [authError, setAuthError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const [nextPath, setNextPath] = useState("/verify-email")
  const needsVerify = nextPath.startsWith("/verify-email")
  // An invitation link sends people here with ?next=/invite/<token>: they return there after signing
  // in, and may sign up with the invited address even while sign-ups aren't open. A plan picked on
  // the pricing page returns them to the billing page with it (lib/next-path.ts).
  const [afterAuth, setAfterAuth] = useState<string | null>(null)
  const inviteToken = inviteTokenFromPath(afterAuth)
  const nextQuery = afterAuth ? `?next=${encodeURIComponent(afterAuth)}` : ""
  // Card height follows its content, animated, so switching forms grows/shrinks smoothly
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState<number | "auto">("auto")
  useEffect(() => {
    if (!contentEl) return
    const ro = new ResizeObserver(() => setCardHeight(contentEl.offsetHeight))
    ro.observe(contentEl)
    return () => ro.disconnect()
  }, [contentEl])
  useEffect(() => {
    if (!isExpanded) setCardHeight("auto")
  }, [isExpanded])
  const [authMode, setAuthMode] = useState<"register" | "login">("register")
  // Who may sign up is set at runtime (lib/signups.ts), so it is asked each time the modal opens.
  // Until it answers, or if it can't, the sign-up form shows; the server refuses what it must.
  const [signupsMode, setSignupsMode] = useState<"open" | "invite_only" | "closed" | null>(null)
  useEffect(() => {
    if (!isExpanded) return
    const controller = new AbortController()
    fetch("/api/auth/signups", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ mode: "open" | "invite_only" | "closed" }>) : null))
      .then((r) => r && setSignupsMode(r.mode))
      .catch(() => {})
    return () => controller.abort()
  }, [isExpanded])
  // invite-only: someone we invited from the waitlist asks for the sign-up form itself
  const [haveInvite, setHaveInvite] = useState(false)
  const showWaitlist = signupsMode !== null && signupsMode !== "open" && !inviteToken && !(signupsMode === "invite_only" && haveInvite)
  // the register side collects emails for the waitlist instead
  const [waitlistDone, setWaitlistDone] = useState(false)

  // When opened from the header "Log in" link, the modal grows out of that point
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const sideInset = typeof window !== "undefined" && window.innerWidth >= 640 ? 16 : 0
  const clipAt = (r: number) =>
    origin ? `circle(${r}px at ${origin.x - sideInset}px ${origin.y - sideInset}px)` : undefined
  const fullRadius = typeof window !== "undefined" ? Math.hypot(window.innerWidth, window.innerHeight) : 2000

  const handleExpand = () => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setOrigin(null)
    setAuthMode("register")
    setIsExpanded(true)
  }

  // Header "Log in" link and pricing CTAs dispatch these events to open the modal
  useEffect(() => {
    const opener = (mode: "login" | "register") => (e: Event) => {
      const { x, y, next } = (e as CustomEvent<{ x: number; y: number; next?: string }>).detail
      if (next !== undefined) setAfterAuth(safeNextPath(next))
      returnFocus.current = document.activeElement as HTMLElement | null
      setOrigin({ x, y })
      setAuthError(null)
      setFormStep("idle")
      setAuthMode(mode)
      setIsExpanded(true)
    }
    const onLogin = opener("login")
    const onRegister = opener("register")
    window.addEventListener("apex:open-login", onLogin)
    window.addEventListener("apex:open-register", onRegister)
    return () => {
      window.removeEventListener("apex:open-login", onLogin)
      window.removeEventListener("apex:open-register", onRegister)
    }
  }, [])

  // /login and /signup render the landing page with the modal already open. They are
  // prerendered, so the OAuth callback's ?error= is read here rather than on the server.
  useEffect(() => {
    if (!initialAuth) return
    const oauthErrors: Record<string, string> = {
      oauth_not_configured: t.auth.errors.oauth_not_configured,
      oauth_denied: t.auth.errors.oauth_denied,
      oauth_email_unverified: t.auth.errors.oauth_email_unverified,
      oauth_failed: t.auth.errors.oauth_failed,
      account_suspended: t.auth.errors.account_suspended,
      oauth_signups_closed: t.auth.errors.oauth_signups_closed,
    }
    const query = new URLSearchParams(window.location.search)
    const error = query.get("error")
    const next = query.get("next")
    setAfterAuth(safeNextPath(next))
    setAuthError(initialAuth === "login" && error ? (oauthErrors[error] ?? null) : null)
    // drop ?error= so a refresh doesn't replay it
    window.history.replaceState(null, "", window.location.pathname)
    setFormStep("idle")
    setAuthMode(initialAuth)
    setIsExpanded(true)
  }, [initialAuth, t])

  const switchMode = (mode: "register" | "login") => {
    setFormStep("idle")
    setAuthError(null)
    setTurnstileToken(null)
    setWaitlistDone(false)
    setAuthMode(mode)
  }

  const handleClose = () => {
    setIsExpanded(false)
    setMeshReady(false)
    returnFocus.current?.focus?.()
    // Reset form after a brief delay so the user doesn't see it reset while closing
    setTimeout(() => {
      setFormStep("idle")
      setWaitlistDone(false)
      setHaveInvite(false)
    }, 500)
  }

  const handleWaitlist = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = new FormData(e.currentTarget).get("email")
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setAuthError("Please wait for the human check to finish, then try again")
      return
    }
    setAuthError(null)
    setFormStep("submitting")
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAuthError(data.message ?? t.auth.errors.generic)
        return
      }
      setWaitlistDone(true)
    } catch {
      setAuthError(t.auth.errors.network)
    } finally {
      setFormStep("idle")
      setTurnstileReset((n) => n + 1)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const field = (name: string) => form.get(name) ?? undefined
    const body =
      authMode === "login"
        ? { email: field("email"), password: field("password"), remember: form.has("rememberMe"), turnstileToken }
        : {
            accountType,
            username: field("username"),
            email: field("email"),
            company: field("company"),
            companySize: field("companySize"),
            password: field("password"),
            acceptTerms: form.has("acceptTerms"),
            allowTraining: form.has("allowTraining"),
            inviteToken,
            turnstileToken,
          }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setAuthError("Please wait for the human check to finish, then try again")
      return
    }
    setAuthError(null)
    setFormStep("submitting")
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAuthError(data.message ?? t.auth.errors.generic)
        setFormStep("idle")
        return
      }
      // two-step sign-in: the code page finishes it
      if (data.twoFactor) return router.push(`/two-factor${nextQuery}`)
      const next = data.user.emailVerified ? (afterAuth ?? "/dashboard?welcome=1") : `/verify-email${nextQuery}`
      setNextPath(next)
      setFormStep("success")
      // the success screen is a beat of feedback, not a stop; Continue stays as a fallback
      setTimeout(() => router.push(next), 1200)
    } catch {
      setAuthError(t.auth.errors.network)
      setFormStep("idle")
    } finally {
      // a Turnstile token works once
      setTurnstileReset((n) => n + 1)
    }
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => { document.body.style.overflow = "unset" }
  }, [isExpanded])

  // Escape closes; Tab stays inside the modal while it is open
  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return handleClose()
      if (e.key !== "Tab" || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
      )].filter((el) => el.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isExpanded])

  // Move focus into the dialog once its content has faded in
  useEffect(() => {
    if (!isExpanded) return
    const t = setTimeout(() => dialogRef.current?.querySelector<HTMLInputElement>("form input:not([type=checkbox])")?.focus(), 350)
    return () => clearTimeout(t)
  }, [isExpanded, authMode])

  return (
    <>
      {!modalOnly && (
      <div className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[var(--color-surface)] px-4 sm:px-6 pb-12 pt-28 sm:pb-20 sm:pt-32">

        {/*
          Light rays: a still frame of @paper-design/shaders' GodRays (colorBack transparent, colors
          #a1a1aa40 #e4e4e740 #71717a40 #52525b40, bloom #a1a1aa, offset 0.85/-1, intensity 0.5,
          spotty 0.45, midSize 10, midIntensity 0, density 0.38, bloom 0.3, scale 1.6, frame
          3332042.8), saved with its alpha so it sits on both themes. Drawn live, the shader cost a
          mid-range phone most of every frame (Lighthouse mobile 40) and kept running behind the
          sign-up card; as an image it is ~30 KB and no script.
        */}
        <picture aria-hidden="true">
          <source media="(orientation: portrait)" srcSet="/marketing/hero-rays-tall.webp" />
          <img src="/marketing/hero-rays-wide.webp" alt="" decoding="async" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" />
        </picture>

        <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 text-center">
          {/* CSS-animated, not framer-motion: the headline must paint before hydration (LCP; globals.css .hero-rise) */}
          <div
            className="hero-in inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-3 py-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 backdrop-blur-sm"
          >
            <span className="mr-2 flex h-2 w-2 rounded-full bg-[var(--color-secondary)]" aria-hidden="true"></span>
            {t.hero.badge}
          </div>

          <h1
            style={{ animationDelay: "0.1s" }}
            className="hero-rise text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 max-w-4xl"
          >
            {t.hero.titleStart}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-zinc-900 to-zinc-500 dark:from-zinc-100 dark:to-zinc-500">
              {t.hero.titleAccent}
            </span>
          </h1>

          <p
            style={{ animationDelay: "0.2s" }}
            className="hero-rise text-base sm:text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-4xl px-4 leading-relaxed text-balance"
          >
            {t.hero.lede1}{" "}
            <br className="hidden md:block" />
            {t.hero.lede2}
          </p>

          {signedIn ? (
            <a
              href="/dashboard"
              className="relative mt-4 inline-flex h-14 items-center gap-2 rounded-full bg-zinc-900 px-8 text-lg font-medium tracking-wide text-white no-underline transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {t.hero.ctaSignedIn}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
          ) : (
          <AnimatePresence initial={false}>
            {!isExpanded && (
              <motion.div className="inline-block relative mt-4">
                {/* The expanding background element */}
                <motion.div
                  style={{ borderRadius: "100px" }}
                  layoutId="cta-card"
                  className="absolute inset-0 bg-zinc-900 dark:bg-zinc-100"
                />
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout={false}
                  onClick={handleExpand}
                  className="relative flex items-center gap-2 h-14 px-8 py-3 bg-transparent border-0 cursor-pointer text-lg font-medium text-white dark:text-zinc-900 tracking-wide hover:opacity-90 transition-opacity"
                >
                  {t.hero.cta}
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
          )}
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.hero.note}</p>
        </div>
      </div>
      )}

      {/*
        Expanded Modal Overlay
      */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={authMode === "login" ? t.auth.dialogLogin : t.auth.dialogRegister}
            className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              layoutId={origin ? undefined : "cta-card"}
              initial={origin ? { clipPath: clipAt(0) } : undefined}
              animate={origin ? { clipPath: clipAt(fullRadius) } : undefined}
              exit={origin ? { clipPath: clipAt(0) } : undefined}
              transition={origin ? { duration: 0.55, ease: [0.4, 0, 0.2, 1] } : { type: "spring", bounce: 0, duration: 0.4 }}
              style={{ borderRadius: "24px", willChange: "transform" }}
              onLayoutAnimationComplete={() => setMeshReady(true)}
              onAnimationComplete={() => { if (origin && isExpanded) setMeshReady(true) }}
              className="relative flex h-full w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 sm:rounded-[24px] shadow-2xl"
            >
              {/* Mesh Gradient Background inside Modal */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: meshReady ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 pointer-events-none"
              >
                {meshReady && (<>
                <MeshGradient
                  speed={reduceMotion ? 0 : 0.6}
                  minPixelRatio={1}
                  maxPixelCount={MESH_PIXELS}
                  colors={["#f4f4f5", "#e4e4e7", "#fafafa", "#d4d4d8"]}
                  distortion={0.8}
                  swirl={0.1}
                  grainMixer={0.15}
                  grainOverlay={0}
                  className="dark:hidden" style={{ height: "100%", width: "100%" }}
                />
                <MeshGradient
                  speed={reduceMotion ? 0 : 0.6}
                  minPixelRatio={1}
                  maxPixelCount={MESH_PIXELS}
                  colors={["#3f3f46", "#27272a", "#18181b", "#52525b"]} // Zinc palette
                  distortion={0.8}
                  swirl={0.1}
                  grainMixer={0.15}
                  grainOverlay={0}
                  className="hidden dark:block" style={{ height: "100%", width: "100%" }}
                />
                </>)}
              </motion.div>

              {/* Close Button */}
              <motion.button
                type="button"
                aria-label={t.common.close}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.25 }}
                onClick={handleClose}
                className="absolute right-4 top-4 sm:right-8 sm:top-8 z-50 cursor-pointer flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/30 text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_16px_rgba(0,0,0,0.08)] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 hover:bg-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-white/15 dark:bg-white/10 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_16px_rgba(0,0,0,0.35)] dark:hover:bg-white/20"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </motion.button>

              {/* Modal Content */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.3 }}
                className="auth-modal relative z-10 flex flex-col lg:flex-row h-full w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden"
              >
                {/* Left Side: Testimonials & Info */}
                {/* Collapses via flex-grow (CSS-driven) so the form column glides to center instead of jumping */}
                <motion.div
                  initial={false}
                  animate={{ flexGrow: authMode === "register" ? 1 : 0, opacity: authMode === "register" ? 1 : 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                  aria-hidden={authMode !== "register"}
                  className={`flex min-w-0 flex-col overflow-hidden max-lg:!grow-0 lg:basis-0 ${authMode === "login" ? "max-lg:hidden pointer-events-none" : ""}`}
                >
                <div className={`flex flex-1 shrink-0 flex-col justify-center p-8 pb-0 sm:p-12 sm:pb-0 lg:pb-16 lg:w-full lg:max-w-[40rem] lg:py-16 lg:pl-16 lg:pr-6 gap-8 text-zinc-900 dark:text-white`}>
                  {authMode === "register" && (
                    <span className="logo__mark block max-lg:mx-auto max-lg:[@media(max-height:700px)]:hidden" style={{ height: 28, width: 216 }} aria-label="Apex Bot" role="img" />
                  )}
                  <div className="flex flex-1 flex-col justify-center gap-8 max-lg:hidden">
                  <div className="space-y-4">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
                      {t.auth.pitch.title}
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-200 text-lg max-w-md">
                      {t.auth.pitch.text}
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center border border-black/10 dark:border-white/10">
                        <Clock className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{t.auth.pitch.items[0].title}</h3>
                        <p className="text-zinc-600 dark:text-zinc-200/80 text-sm leading-relaxed mt-1">
                          {t.auth.pitch.items[0].text}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center border border-black/10 dark:border-white/10">
                        <Languages className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{t.auth.pitch.items[1].title}</h3>
                        <p className="text-zinc-600 dark:text-zinc-200/80 text-sm leading-relaxed mt-1">
                          {t.auth.pitch.items[1].text}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center border border-black/10 dark:border-white/10">
                        <LifeBuoy className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{t.auth.pitch.items[2].title}</h3>
                        <p className="text-zinc-600 dark:text-zinc-200/80 text-sm leading-relaxed mt-1">
                          {t.auth.pitch.items[2].text}
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="pt-8 border-t border-black/10 dark:border-white/20 max-lg:hidden [@media(max-height:820px)]:hidden">
                    <figure className="m-0">
                      <blockquote className="mx-0 mt-0 max-w-md text-base font-medium leading-relaxed mb-6">
                        “{t.auth.pitch.quote}”
                      </blockquote>
                      <figcaption className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 flex items-center justify-center text-lg font-bold text-white">
                          MA
                        </div>
                        <div>
                          <div className="font-semibold">M. Barış Akıntı</div>
                          <div className="text-sm text-zinc-600 dark:text-zinc-300">{t.auth.pitch.quoteRole}</div>
                        </div>
                      </figcaption>
                    </figure>
                  </div>
                </div>
                </motion.div>

                {/* Right Side: Form. Centered when it fits; on short screens it scrolls instead of
                    being clipped (auto margins, not justify-center, keep the top reachable) */}
                <div className="relative isolate flex flex-1 flex-col items-center gap-8 p-4 sm:p-12 lg:overflow-y-auto lg:px-16 lg:py-10 [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
                    {authMode === "login" && formStep !== "success" && (
                      <span
                        key="logo"
                        className="logo__mark mb-2"
                        style={{ height: 28 }}
                        aria-label="Apex Bot"
                        role="img"
                      />
                    )}
                  <motion.div layout={meshReady ? "position" : false} transition={{ type: "spring", bounce: 0, duration: 0.5 }} className={`w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/15 bg-white dark:bg-black p-5 sm:p-6 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(0,0,0,0.06),0_12px_24px_rgba(0,0,0,0.1),0_32px_64px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_0_0_1px_rgba(255,255,255,0.04),0_2px_4px_rgba(0,0,0,0.5),0_16px_32px_rgba(0,0,0,0.55),0_40px_80px_-12px_rgba(0,0,0,0.9)]`}>

                    <motion.div
                      initial={false}
                      animate={{ height: cardHeight }}
                      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                      style={{ overflow: "hidden" }}
                    >
                    <div ref={setContentEl}>
                    <motion.div
                      key={authMode}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                    {formStep === "success" ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center text-center h-[400px] space-y-6"
                      >
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${needsVerify ? "bg-indigo-600 shadow-indigo-600/30" : "bg-green-500 shadow-green-500/30"}`}>
                          {needsVerify ? <ArrowRight className="w-10 h-10 text-white" /> : <Check className="w-10 h-10 text-white" />}
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{!needsVerify ? t.auth.success.welcomeBack : t.auth.success.verifyTitle}</h3>
                          <p className="text-zinc-600 dark:text-zinc-200">{!needsVerify ? t.auth.success.loggedIn : t.auth.success.verifyText}</p>
                        </div>
                        <button
                          onClick={() => router.push(nextPath)}
                          className="cursor-pointer px-6 py-2 bg-black/10 hover:bg-black/15 text-zinc-900 dark:bg-white/20 dark:hover:bg-white/30 dark:text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          {t.auth.success.continue}
                        </button>
                      </motion.div>
                    ) : authMode === "login" ? (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 pb-1 text-center text-zinc-900 dark:text-white">
                          <h2 className="text-3xl font-bold tracking-tight">{t.auth.login.title}</h2>
                          <p className="text-lg text-zinc-600 dark:text-zinc-300">{t.auth.login.subtitle}</p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label htmlFor="login-email" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              {t.auth.login.email}
                            </label>
                            <input
                              required
                              type="email"
                              id="login-email" {...noExtensionUi}
                              name="email"
                              autoComplete="email"
                              placeholder={t.auth.login.emailPlaceholder}
                              className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                            />
                          </div>
                          <div>
                            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              {t.auth.login.password}
                            </label>
                            <PasswordInput required id="login-password" name="password" autoComplete="current-password" placeholder={t.auth.login.passwordPlaceholder} />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                          <label htmlFor="remember-me" className="flex items-center gap-3 text-xs text-zinc-800 dark:text-zinc-100 cursor-pointer">
                            <input
                              type="checkbox"
                              id="remember-me"
                              name="rememberMe"
                              className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-400/30 accent-zinc-900 dark:accent-white cursor-pointer"
                            />
                            {t.auth.login.remember}
                          </label>
                          <a href="/forgot-password" className="text-xs text-zinc-600 dark:text-zinc-300 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">{t.auth.login.forgot}</a>
                          </div>
                        </div>

                        <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />

                        {authError && (
                          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{authError}</p>
                        )}

                        <button
                          disabled={formStep === "submitting"}
                          type="submit"
                          className="w-full cursor-pointer flex items-center justify-center px-8 py-3 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-800 dark:hover:bg-zinc-100 font-semibold transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {formStep === "submitting" ? (
                            <span className="flex items-center gap-2">
                              <span className="h-4 w-4 border-2 border-white/70 dark:border-zinc-600 border-t-transparent rounded-full animate-spin"></span>
                              {t.auth.login.submitting}
                            </span>
                          ) : t.auth.login.submit}
                        </button>

                        <SocialButtons verb={t.auth.login.verb} next={afterAuth} />

                        <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                          {t.auth.login.noAccount}{" "}
                          <button
                            type="button"
                            onClick={() => switchMode("register")}
                            className="cursor-pointer border-0 bg-transparent p-0 font-medium underline underline-offset-2 text-zinc-900 dark:text-white"
                          >
                            {t.auth.login.createOne}
                          </button>
                        </p>
                      </form>
                    ) : showWaitlist ? (
                      waitlistDone ? (
                        <div className="flex flex-col items-center space-y-5 py-6 text-center text-zinc-900 dark:text-white">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30">
                            <Check className="h-8 w-8 text-white" />
                          </div>
                          <div>
                            <h3 className="mb-2 text-2xl font-bold">{t.auth.waitlist.doneTitle}</h3>
                            <p className="text-zinc-600 dark:text-zinc-200">{signupsMode === "invite_only" ? t.auth.waitlist.doneInvite : t.auth.waitlist.doneText}</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleClose}
                            className="cursor-pointer rounded-lg bg-black/10 px-6 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-black/15 dark:bg-white/20 dark:text-white dark:hover:bg-white/30"
                          >
                            {t.auth.waitlist.close}
                          </button>
                        </div>
                      ) : (
                        <form onSubmit={handleWaitlist} className="space-y-4">
                          <div className="space-y-1 pb-1 text-center text-zinc-900 dark:text-white">
                            <h2 className="text-3xl font-bold tracking-tight">{t.auth.waitlist.title}</h2>
                            <p className="text-lg text-zinc-600 dark:text-zinc-300">
                              {signupsMode === "invite_only" ? t.auth.waitlist.inviteOnly : t.auth.waitlist.subtitle}
                            </p>
                          </div>
                          <div>
                            <label htmlFor="waitlist-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                              {t.auth.waitlist.email}
                            </label>
                            <input
                              required
                              type="email"
                              id="waitlist-email" {...noExtensionUi}
                              name="email"
                              autoComplete="email"
                              placeholder={t.auth.waitlist.emailPlaceholder}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 transition-all placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-400/20 dark:bg-zinc-950/40 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/40"
                            />
                          </div>

                          <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />

                          {authError && (
                            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{authError}</p>
                          )}

                          <button
                            disabled={formStep === "submitting"}
                            type="submit"
                            className="flex w-full cursor-pointer items-center justify-center rounded-lg bg-zinc-900 px-8 py-3 font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-zinc-800 dark:hover:bg-zinc-100"
                          >
                            {formStep === "submitting" ? (
                              <span className="flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent dark:border-zinc-600"></span>
                                {t.auth.waitlist.submitting}
                              </span>
                            ) : t.auth.waitlist.submit}
                          </button>

                          {signupsMode === "invite_only" && (
                            <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                              {t.auth.waitlist.haveInvite}{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setAuthError(null)
                                  setHaveInvite(true)
                                }}
                                className="cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-900 underline underline-offset-2 dark:text-white"
                              >
                                {t.auth.waitlist.haveInviteLink}
                              </button>
                            </p>
                          )}

                          <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                            {t.auth.register.haveAccount}{" "}
                            <button
                              type="button"
                              onClick={() => switchMode("login")}
                              className="cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-900 underline underline-offset-2 dark:text-white"
                            >
                              {t.auth.register.logIn}
                            </button>
                          </p>
                        </form>
                      )
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 pb-1 text-center text-zinc-900 dark:text-white">
                          <h2 className="text-3xl font-bold tracking-tight">{t.auth.register.title}</h2>
                          <p className="text-lg text-zinc-600 dark:text-zinc-300">
                            {t.auth.register.subtitle}
                          </p>
                        </div>

                        <div
                          role="tablist"
                          aria-label={t.auth.register.accountType}
                          className="relative grid grid-cols-2 rounded-lg bg-black/5 dark:bg-white/10 p-1"
                        >
                          {(["personal", "business"] as const).map((type) => (
                            <button
                              key={type}
                              type="button"
                              role="tab"
                              aria-selected={accountType === type}
                              onClick={() => setAccountType(type)}
                              className="relative z-10 cursor-pointer rounded-md border-0 bg-transparent py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                            >
                              {accountType === type && (
                                <motion.span
                                  layoutId="account-type-pill"
                                  transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                                  className="absolute inset-0 -z-10 rounded-md bg-white dark:bg-zinc-900 shadow-sm"
                                />
                              )}
                              <span className={accountType === type ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400"}>
                                {type === "business" ? t.auth.register.business : t.auth.register.personal}
                              </span>
                            </button>
                          ))}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label htmlFor="username" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              {t.auth.register.username}
                            </label>
                            <input
                              required
                              type="text"
                              id="username"
                              name="username"
                              autoComplete="username"
                              minLength={3}
                              maxLength={32}
                              pattern="[A-Za-z0-9_.\-]{3,32}"
                              title={t.auth.register.usernameHint}
                              placeholder={t.auth.register.usernamePlaceholder}
                              className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                            />
                          </div>

                          <div>
                            <label htmlFor="email" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              {isBusiness ? t.auth.register.workEmail : t.auth.register.personalEmail}
                            </label>
                            <input
                              required
                              type="email"
                              id="email" {...noExtensionUi}
                              name="email"
                              autoComplete="email"
                              placeholder={isBusiness ? t.auth.register.workEmailPlaceholder : t.auth.register.personalEmailPlaceholder}
                              className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                            />
                          </div>

                          {isBusiness && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="company" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                                {t.auth.register.company}
                              </label>
                              <input
                                type="text"
                                id="company"
                                name="company"
                                placeholder={t.auth.register.companyPlaceholder}
                                className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                              />
                            </div>
                            <div>
                              <label htmlFor="size" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                                {t.auth.register.size}
                              </label>
                              <select
                                id="size"
                                name="companySize"
                                className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm appearance-none cursor-pointer"
                              >
                                <option>1-50</option>
                                <option>51-200</option>
                                <option>201-1000</option>
                                <option>1000+</option>
                              </select>
                            </div>
                          </div>
                          )}

                          <div>
                            <label htmlFor="password" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              {t.auth.register.password}
                            </label>
                            <PasswordInput required id="password" name="password" minLength={8} autoComplete="new-password" placeholder={t.auth.register.passwordPlaceholder} />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-start gap-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">
                            <input
                              required
                              type="checkbox"
                              name="acceptTerms"
                              aria-labelledby="accept-terms-label"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-400/30 accent-zinc-900 dark:accent-white cursor-pointer"
                            />
                            <span id="accept-terms-label">{t.auth.register.acceptPre} <a href={href("/terms")} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">{t.nav.terms}</a> {t.auth.and} <a href={href("/privacy")} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">{t.nav.privacy}</a>.</span>
                          </div>
                          <div className="flex items-start gap-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">
                            <input
                              type="checkbox"
                              name="allowTraining"
                              aria-labelledby="allow-training-label"
                              defaultChecked
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-400/30 accent-zinc-900 dark:accent-white cursor-pointer"
                            />
                            <span id="allow-training-label">{t.auth.register.allowTraining}</span>
                          </div>
                        </div>

                        <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />

                        {authError && (
                          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{authError}</p>
                        )}

                        <button
                          disabled={formStep === "submitting"}
                          type="submit"
                          className="w-full cursor-pointer flex items-center justify-center px-8 py-3 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-800 dark:hover:bg-zinc-100 font-semibold transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                        >
                          {formStep === "submitting" ? (
                             <span className="flex items-center gap-2">
                               <span className="h-4 w-4 border-2 border-white/70 dark:border-zinc-600 border-t-transparent rounded-full animate-spin"></span>
                               {t.auth.register.submitting}
                             </span>
                          ) : t.auth.register.submit}
                        </button>

                        <SocialButtons verb={t.auth.register.verb} accountType={accountType} next={afterAuth} />

                        <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                          {t.auth.register.haveAccount}{" "}
                          <button
                            type="button"
                            onClick={() => switchMode("login")}
                            className="cursor-pointer border-0 bg-transparent p-0 font-medium underline underline-offset-2 text-zinc-900 dark:text-white"
                          >
                            {t.auth.register.logIn}
                          </button>
                        </p>

                      </form>
                    )}
                    </motion.div>
                    </div>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
