"use client"

// What the "Report a problem" form attaches by itself: the page, the browser, and the last error the
// dashboard saw in this tab. The customer sees all of it before sending and can leave it out. The
// server keeps only known fields at bounded sizes (cleanTicketContext in @apex/db).

export interface LastError {
  message: string
  source?: string
  at: string
}

let lastError: LastError | null = null
let installed = false

function describe(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`
  if (typeof reason === "string") return reason
  try {
    return JSON.stringify(reason) ?? String(reason)
  } catch {
    return String(reason)
  }
}

/** Starts listening for uncaught errors in this tab; safe to call more than once. */
export function trackErrors() {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("error", (e) => {
    // a failed <img> or <script> fires "error" too, without a message
    if (!e.message) return
    const where = e.filename ? `${e.filename.replace(window.location.origin, "")}:${e.lineno}:${e.colno}` : undefined
    lastError = { message: e.message.slice(0, 1000), source: where, at: new Date().toISOString() }
  })
  window.addEventListener("unhandledrejection", (e) => {
    lastError = { message: describe(e.reason).slice(0, 1000), at: new Date().toISOString() }
  })
}

/** Records an error the app caught and showed itself, e.g. a failed save. */
export function noteError(message: string, source?: string) {
  lastError = { message: message.slice(0, 1000), source, at: new Date().toISOString() }
}

export interface ReportContext {
  page: string
  browser: { userAgent: string; language: string; timeZone: string; viewport: string; platform: string }
  lastError: LastError | null
}

export function reportContext(): ReportContext {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  let timeZone = ""
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {}
  return {
    // the path only: query strings can hold things that aren't ours to send
    page: window.location.pathname,
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timeZone,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      platform: nav.userAgentData?.platform ?? "",
    },
    lastError,
  }
}

/** Short browser name and version from a user agent, for showing the customer what is sent. */
export function browserLabel(userAgent: string): string {
  const pick = (re: RegExp, name: string) => {
    const m = userAgent.match(re)
    return m ? `${name} ${m[1]}` : null
  }
  return (
    pick(/Edg\/(\d+)/, "Edge") ??
    pick(/OPR\/(\d+)/, "Opera") ??
    pick(/Firefox\/(\d+)/, "Firefox") ??
    pick(/Chrome\/(\d+)/, "Chrome") ??
    pick(/Version\/(\d+)[.\d]* .*Safari/, "Safari") ??
    userAgent.slice(0, 60)
  )
}

/** Opens the "Report a problem" form from anywhere in the dashboard (the help menu listens). */
export const REPORT_EVENT = "apex:report-problem"
export const openReportForm = () => window.dispatchEvent(new Event(REPORT_EVENT))
