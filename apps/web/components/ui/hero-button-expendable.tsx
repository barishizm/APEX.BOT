"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, Check, ArrowRight, Clock, Languages, BarChart3, Eye, EyeOff } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { GodRays, MeshGradient } from "@paper-design/shaders-react"

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

function SocialButtons({ verb }: { verb: string }) {
  return (
    <>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        or
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>

      <div className="space-y-2">
        {[
          { name: "Google", logo: <GoogleLogo /> },
          { name: "GitHub", logo: <GitHubLogo /> },
        ].map(({ name, logo }) => (
          <button
            key={name}
            type="button"
            className="w-full flex items-center justify-center gap-3 px-8 py-2.5 rounded-lg border border-zinc-300 dark:border-white/20 bg-white dark:bg-zinc-950 text-sm font-medium text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 transition-colors cursor-pointer"
          >
            {logo}
            {verb} with {name}
          </button>
        ))}
      </div>
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
        aria-label={visible ? "Hide password" : "Show password"}
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

export default function Hero({ modalOnly = false }: { modalOnly?: boolean }) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const [meshReady, setMeshReady] = useState(false)
  const [accountType, setAccountType] = useState<"business" | "personal">("business")
  const isBusiness = accountType === "business"
  const [formStep, setFormStep] = useState<"idle" | "submitting" | "success">("idle")
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

  // When opened from the header "Log in" link, the modal grows out of that point
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const sideInset = typeof window !== "undefined" && window.innerWidth >= 640 ? 16 : 0
  const clipAt = (r: number) =>
    origin ? `circle(${r}px at ${origin.x - sideInset}px ${origin.y - sideInset}px)` : undefined
  const fullRadius = typeof window !== "undefined" ? Math.hypot(window.innerWidth, window.innerHeight) : 2000

  const handleExpand = () => {
    setOrigin(null)
    setAuthMode("register")
    setIsExpanded(true)
  }

  // Header "Log in" link and pricing CTAs dispatch these events to open the modal
  useEffect(() => {
    const opener = (mode: "login" | "register") => (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail
      setOrigin({ x, y })
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

  // The dashboard guard redirects here with ?login=1
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("login") !== "1") return
    window.history.replaceState(null, "", window.location.pathname)
    setFormStep("idle")
    setAuthMode("login")
    setIsExpanded(true)
  }, [])

  const switchMode = (mode: "register" | "login") => {
    setFormStep("idle")
    setAuthMode(mode)
  }

  const handleClose = () => {
    setIsExpanded(false)
    setMeshReady(false)
    // Reset form after a brief delay so the user doesn't see it reset while closing
    setTimeout(() => setFormStep("idle"), 500)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const email = new FormData(e.currentTarget as HTMLFormElement).get("email")
    if (typeof email === "string") {
      try {
        sessionStorage.setItem("apex:verify:email", email)
      } catch {}
    }
    setFormStep("submitting")
    // Simulate API call
    setTimeout(() => {
      // Placeholder session until real auth exists; proxy.ts checks for it
      document.cookie = "apex_session=1; path=/; max-age=2592000; samesite=lax"
      setFormStep("success")
    }, 1500)
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

  // Close on Escape
  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isExpanded])

  return (
    <>
      {!modalOnly && (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white dark:bg-zinc-950 px-4 sm:px-6 py-12 sm:py-20 transition-colors duration-300">

        {/* GodRays Background - Adjusted to be subtle in both modes */}
        <div className="absolute inset-0 pointer-events-none">
          <GodRays
            colorBack="#00000000"
            // Using slightly transparent grays/whites to work on both dark/light backgrounds
            colors={["#a1a1aa40", "#e4e4e740", "#71717a40", "#52525b40"]}
            colorBloom="#a1a1aa"
            offsetX={0.85}
            offsetY={-1}
            intensity={0.5}
            spotty={0.45}
            midSize={10}
            midIntensity={0}
            density={0.38}
            bloom={0.3}
            speed={0.5}
            scale={1.6}
            frame={3332042.8159981333}
            style={{
              height: "100%",
              width: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-3 py-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 backdrop-blur-sm"
          >
            <span className="flex h-2 w-2 rounded-full bg-zinc-500 mr-2"></span>
            New: We are Close Beta!
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 max-w-4xl"
          >
            Support that{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-zinc-900 to-zinc-500 dark:from-zinc-100 dark:to-zinc-500">
              never sleeps.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-4xl px-4 leading-relaxed"
          >
            Give every visitor instant answers without hiring more staff.{" "}
            <br className="hidden md:block" />
            Set up in minutes, customize to your brand, and start supporting customers today.
          </motion.p>

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
                  Start building now
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      )}

      {/*
        Expanded Modal Overlay
      */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
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
                  speed={0.6}
                  colors={["#f4f4f5", "#e4e4e7", "#fafafa", "#d4d4d8"]}
                  distortion={0.8}
                  swirl={0.1}
                  grainMixer={0.15}
                  grainOverlay={0}
                  className="dark:hidden" style={{ height: "100%", width: "100%" }}
                />
                <MeshGradient
                  speed={0.6}
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
                aria-label="Close"
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
                <div className={`flex flex-1 shrink-0 flex-col justify-center p-8 pb-0 sm:p-12 sm:pb-0 lg:pb-16 lg:w-[40rem] lg:py-16 lg:pl-16 lg:pr-6 gap-8 text-zinc-900 dark:text-white`}>
                  {authMode === "register" && (
                    <span className="logo__mark block max-lg:mx-auto max-lg:[@media(max-height:700px)]:hidden" style={{ height: 28, width: 216 }} aria-label="Apex Bot" role="img" />
                  )}
                  <div className="flex flex-1 flex-col justify-center gap-8 max-lg:hidden">
                  <div className="space-y-4">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
                      Ready to build?
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-200 text-lg max-w-md">
                      Join today and start supporting your customers with Apex
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center border border-black/10 dark:border-white/10">
                        <Clock className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">Always On, 24/7</h3>
                        <p className="text-zinc-600 dark:text-zinc-200/80 text-sm leading-relaxed mt-1">
                          Answer customer questions instantly, any time of day, without growing your team.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center border border-black/10 dark:border-white/10">
                        <Languages className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">Speaks Your Customers' Language</h3>
                        <p className="text-zinc-600 dark:text-zinc-200/80 text-sm leading-relaxed mt-1">
                          Reply in English, German and more, grounded in your own docs and knowledge base.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-black/5 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center border border-black/10 dark:border-white/10">
                        <BarChart3 className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">Insights That Improve Support</h3>
                        <p className="text-zinc-600 dark:text-zinc-200/80 text-sm leading-relaxed mt-1">
                          Track resolution rates, top questions and knowledge gaps to keep getting better.
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="pt-8 border-t border-black/10 dark:border-white/20 max-lg:hidden">
                    <figure className="m-0">
                      <blockquote className="mx-0 mt-0 max-w-md text-base font-medium leading-relaxed mb-6">
                        "We built Apex so every customer gets an instant, accurate answer at any hour, and support teams can finally focus on the hard cases."
                      </blockquote>
                      <figcaption className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-orange-400 to-pink-500 flex items-center justify-center text-lg font-bold text-white">
                          MA
                        </div>
                        <div>
                          <div className="font-semibold">M. Barış Akıntı</div>
                          <div className="text-sm text-zinc-600 dark:text-zinc-300">CEO of APEX BOT</div>
                        </div>
                      </figcaption>
                    </figure>
                  </div>
                </div>
                </motion.div>

                {/* Right Side: Form */}
                <div className="relative isolate flex-1 flex flex-col gap-8 items-center justify-center p-4 sm:p-12 lg:p-16">
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
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${authMode === "register" ? "bg-indigo-600 shadow-indigo-600/30" : "bg-green-500 shadow-green-500/30"}`}>
                          {authMode === "register" ? <ArrowRight className="w-10 h-10 text-white" /> : <Check className="w-10 h-10 text-white" />}
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{authMode === "login" ? "Welcome back!" : "Verify your email"}</h3>
                          <p className="text-zinc-600 dark:text-zinc-200">{authMode === "login" ? "You're logged in to Apex." : "You'll be redirected to the next step to verify your email."}</p>
                        </div>
                        <button
                          onClick={() => router.push(authMode === "register" ? "/verify-email" : "/dashboard?welcome=1")}
                          className="cursor-pointer px-6 py-2 bg-black/10 hover:bg-black/15 text-zinc-900 dark:bg-white/20 dark:hover:bg-white/30 dark:text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          Continue
                        </button>
                      </motion.div>
                    ) : authMode === "login" ? (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 pb-1 text-center text-zinc-900 dark:text-white">
                          <h2 className="text-4xl font-normal tracking-tight" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>Welcome back</h2>
                          <p className="text-lg italic text-zinc-600 dark:text-zinc-300" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>Log in to manage your support bot.</p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label htmlFor="login-email" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              Email
                            </label>
                            <input
                              required
                              type="email"
                              id="login-email" {...noExtensionUi}
                              name="email"
                              autoComplete="email"
                              placeholder="jane@company.com"
                              className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                            />
                          </div>
                          <div>
                            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              Password
                            </label>
                            <PasswordInput required id="login-password" name="password" autoComplete="current-password" placeholder="Your password" />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                          <label htmlFor="remember-me" className="flex items-center gap-3 text-xs text-zinc-800 dark:text-zinc-100 cursor-pointer">
                            <input
                              type="checkbox"
                              id="remember-me"
                              name="rememberMe"
                              className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-400/30 accent-zinc-900 dark:accent-white cursor-pointer"
                            />
                            Keep me signed in
                          </label>
                          <a href="/forgot-password" className="text-xs text-zinc-600 dark:text-zinc-300 underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">Forgot password?</a>
                          </div>
                        </div>

                        <button
                          disabled={formStep === "submitting"}
                          type="submit"
                          className="w-full cursor-pointer flex items-center justify-center px-8 py-3 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-800 dark:hover:bg-zinc-100 font-semibold transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {formStep === "submitting" ? (
                            <span className="flex items-center gap-2">
                              <span className="h-4 w-4 border-2 border-white/70 dark:border-zinc-600 border-t-transparent rounded-full animate-spin"></span>
                              Logging in...
                            </span>
                          ) : "Log in"}
                        </button>

                        <SocialButtons verb="Log in" />

                        <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                          Don't have an account?{" "}
                          <button
                            type="button"
                            onClick={() => switchMode("register")}
                            className="cursor-pointer border-0 bg-transparent p-0 font-medium underline underline-offset-2 text-zinc-900 dark:text-white"
                          >
                            Create one
                          </button>
                        </p>
                      </form>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 pb-1 text-center text-zinc-900 dark:text-white">
                          <h2 className="text-4xl font-normal tracking-tight" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>Create your account</h2>
                          <p className="text-lg italic text-zinc-600 dark:text-zinc-300" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
                            Set up Apex for your own site in minutes.
                          </p>
                        </div>

                        <div
                          role="tablist"
                          aria-label="Account type"
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
                                {type === "business" ? "Business" : "Personal"}
                              </span>
                            </button>
                          ))}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label htmlFor="username" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              Username
                            </label>
                            <input
                              required
                              type="text"
                              id="username"
                              name="username"
                              autoComplete="username"
                              minLength={3}
                              placeholder="janedoe"
                              className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                            />
                          </div>

                          <div>
                            <label htmlFor="email" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              {isBusiness ? "Work Email" : "Personal Email"}
                            </label>
                            <input
                              required
                              type="email"
                              id="email" {...noExtensionUi}
                              name="email"
                              autoComplete="email"
                              placeholder={isBusiness ? "jane@company.com" : "jane@example.com"}
                              className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                            />
                          </div>

                          {isBusiness && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="company" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                                Company
                              </label>
                              <input
                                type="text"
                                id="company"
                                placeholder="Acme Inc"
                                className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm"
                              />
                            </div>
                            <div>
                              <label htmlFor="size" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                                Size
                              </label>
                              <select
                                id="size"
                                className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-zinc-950/40 border border-zinc-300 dark:border-zinc-400/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-white/30 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-all text-sm appearance-none cursor-pointer"
                              >
                                <option className="bg-zinc-900">1-50</option>
                                <option className="bg-zinc-900">51-200</option>
                                <option className="bg-zinc-900">201-1000</option>
                                <option className="bg-zinc-900">1000+</option>
                              </select>
                            </div>
                          </div>
                          )}

                          <div>
                            <label htmlFor="password" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
                              Password
                            </label>
                            <PasswordInput required id="password" name="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
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
                            <span id="accept-terms-label">I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">Privacy Policy</a>.</span>
                          </div>
                          <div className="flex items-start gap-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">
                            <input
                              type="checkbox"
                              name="allowTraining"
                              aria-labelledby="allow-training-label"
                              defaultChecked
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-400/30 accent-zinc-900 dark:accent-white cursor-pointer"
                            />
                            <span id="allow-training-label">Allow Apex to use my bots and conversations to improve and train its models (optional).</span>
                          </div>
                        </div>

                        <button
                          disabled={formStep === "submitting"}
                          type="submit"
                          className="w-full cursor-pointer flex items-center justify-center px-8 py-3 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-800 dark:hover:bg-zinc-100 font-semibold transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                        >
                          {formStep === "submitting" ? (
                             <span className="flex items-center gap-2">
                               <span className="h-4 w-4 border-2 border-white/70 dark:border-zinc-600 border-t-transparent rounded-full animate-spin"></span>
                               Creating account...
                             </span>
                          ) : "Create account"}
                        </button>

                        <SocialButtons verb="Sign up" />

                        <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                          Already have an account?{" "}
                          <button
                            type="button"
                            onClick={() => switchMode("login")}
                            className="cursor-pointer border-0 bg-transparent p-0 font-medium underline underline-offset-2 text-zinc-900 dark:text-white"
                          >
                            Log in
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
