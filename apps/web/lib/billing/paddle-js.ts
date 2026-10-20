import type { CheckoutConfig } from "./types"

// Paddle.js v2 for the overlay checkout, loaded from Paddle's CDN when the billing page first needs
// it (Paddle requires the CDN copy; the CSP's frame-src in next.config.mjs allows its checkout frame).
// https://developer.paddle.com/paddle-js/overview

const SRC = "https://cdn.paddle.com/paddle/v2/paddle.js"

export type PaddleEventName = "checkout.loaded" | "checkout.completed" | "checkout.closed" | "checkout.error" | (string & {})
export interface PaddleEvent {
  name?: PaddleEventName
  data?: { transaction_id?: string } & Record<string, unknown>
}

interface PaddleJs {
  Environment: { set(environment: "sandbox"): void }
  Initialize(options: { token: string; eventCallback: (event: PaddleEvent) => void }): void
  Checkout: {
    open(options: { transactionId: string; settings: { displayMode: "overlay"; locale?: string; theme?: "light" | "dark"; successUrl?: string } }): void
    close(): void
  }
}

declare global {
  interface Window {
    Paddle?: PaddleJs
  }
}

let loading: Promise<PaddleJs> | null = null
let initializedWith: string | null = null
// Paddle.js takes one event callback, at Initialize; this is the open checkout's
let listener: ((event: PaddleEvent) => void) | null = null

function load(): Promise<PaddleJs> {
  loading ??= new Promise<PaddleJs>((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle)
    const script = document.createElement("script")
    script.src = SRC
    script.async = true
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle.js didn't load")))
    script.onerror = () => reject(new Error("Paddle.js didn't load"))
    document.head.appendChild(script)
  }).catch((err) => {
    // a blocked or failed load can be retried
    loading = null
    throw err
  })
  return loading
}

/** Opens Paddle's overlay for a transaction made on the server; `onEvent` hears what happens in it. */
export async function openCheckout(config: CheckoutConfig, onEvent: (event: PaddleEvent) => void) {
  const paddle = await load()
  if (initializedWith !== config.clientToken) {
    if (config.environment === "sandbox") paddle.Environment.set("sandbox")
    paddle.Initialize({ token: config.clientToken, eventCallback: (event) => listener?.(event) })
    initializedWith = config.clientToken
  }
  listener = onEvent
  const theme = document.documentElement.classList.contains("dark") ? "dark" : "light"
  paddle.Checkout.open({ transactionId: config.transactionId, settings: { displayMode: "overlay", theme, ...config.settings } })
}

export function closeCheckout() {
  window.Paddle?.Checkout.close()
}
