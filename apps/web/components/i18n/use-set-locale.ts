"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n"

// App pages take their language from the cookie, so switching is: store it, re-render on the server
export function useSetLocale() {
  const router = useRouter()
  return useCallback(
    (locale: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
      router.refresh()
    },
    [router],
  )
}
