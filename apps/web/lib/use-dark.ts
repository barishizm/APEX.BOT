"use client"

import { useSyncExternalStore } from "react"

// The <html> "dark" class is the single source of truth: the head script sets it from the
// saved choice or the OS, and every theme control keeps it in sync.
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => obs.disconnect()
}

export function useDark() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  )
}
