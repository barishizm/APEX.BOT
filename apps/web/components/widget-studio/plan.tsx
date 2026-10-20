"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { BotSettings } from "@apex/db/bot-settings"
import { modelAllowed } from "@apex/db/entitlements"
import type { PlanEntitlements } from "@apex/db/plans"
import { useAppI18n } from "@/components/i18n/app-provider"
import { UpgradeNote } from "@/components/plan/upgrade-note"

// What the workspace's plan doesn't include, for the sections to lock (the server refuses it
// either way, @apex/db/entitlements). `saved` is the stored settings: a value the bot already has
// from a bigger plan may stay, it is only not applied.
const PlanContext = createContext<{ entitlements: PlanEntitlements | null; saved: BotSettings } | null>(null)
export const PlanProvider = PlanContext.Provider

/** `ent` is null while nothing is locked (plan limits off for the workspace). */
export function usePlanLocks() {
  const ctx = useContext(PlanContext)
  const ent = ctx?.entitlements ?? null
  return {
    ent,
    saved: ctx?.saved ?? null,
    modelLocked: (provider: string, id: string) => !!ent && !modelAllowed(ent, provider, id),
  }
}

export function PlanNote({ children, inline }: { children: ReactNode; inline?: boolean }) {
  const t = useAppI18n().t.studio.plan
  return (
    <UpgradeNote upgrade={t.upgrade} inline={inline}>
      {children}
    </UpgradeNote>
  )
}
