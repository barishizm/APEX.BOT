"use client"

import { useSyncExternalStore } from "react"

// A readable companion to the httpOnly session cookie. It only says "probably signed in",
// so the statically rendered marketing pages can swap "Log in" for "Dashboard" in the
// browser. It grants nothing: every page and API route still validates the real session.
export const SIGNED_IN_COOKIE = "apex_signed_in"

const read = () => document.cookie.split("; ").some((c) => c === `${SIGNED_IN_COOKIE}=1`)
const subscribe = () => () => {}

export function useSignedIn() {
  return useSyncExternalStore(subscribe, read, () => false)
}
