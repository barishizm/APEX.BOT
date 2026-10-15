import type { ReactNode } from "react"
import { DashboardShell, type NavLabel } from "@/components/ui/dashboard-shell"
import { requireVerifiedUser } from "@/lib/auth"
import { getSetup } from "@/lib/dashboard"

// Server wrapper: every dashboard page gets the signed-in user and real setup progress
export async function DashboardFrame({ active, intro, children }: { active?: NavLabel; intro?: boolean; children: ReactNode }) {
  const user = await requireVerifiedUser()
  const setup = Object.values(await getSetup(user.id))
  return (
    <DashboardShell user={{ username: user.username, email: user.email }} active={active} intro={intro} setup={{ done: setup.filter(Boolean).length, total: setup.length }}>
      {children}
    </DashboardShell>
  )
}
