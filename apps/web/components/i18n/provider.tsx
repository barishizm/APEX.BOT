"use client"

import { createContext, useContext, useMemo } from "react"
import { DEFAULT_LOCALE, localizePath, type Dictionary, type Locale } from "@/lib/i18n"

type I18n = { locale: Locale; t: Dictionary; href: (path: string) => string }

const I18nContext = createContext<I18n | null>(null)

// Client components read the page's language and strings from here; the dictionary comes
// from the server layout, so no translation file is bundled into client JavaScript.
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: dict, href: (path: string) => localizePath(path, locale) }), [locale, dict])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error(`useI18n() needs an <I18nProvider> (default locale: ${DEFAULT_LOCALE})`)
  return ctx
}
