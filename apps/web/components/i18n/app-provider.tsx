"use client"

import { createContext, useContext } from "react"
import { useI18n } from "@/components/i18n/provider"
import type { AppDictionary } from "@/lib/i18n/app"

const AppI18nContext = createContext<AppDictionary | null>(null)

// The dashboard's strings, provided only inside the app layout so marketing pages don't ship them
export function AppI18nProvider({ dict, children }: { dict: AppDictionary; children: React.ReactNode }) {
  return <AppI18nContext.Provider value={dict}>{children}</AppI18nContext.Provider>
}

export function useAppI18n() {
  const t = useContext(AppI18nContext)
  if (!t) throw new Error("useAppI18n() needs an <AppI18nProvider>")
  const { locale, href, t: site } = useI18n()
  return { t, locale, href, site }
}
