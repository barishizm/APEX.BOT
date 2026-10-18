import type { Metadata } from "next"
import { AdminShell } from "@/components/ui/admin-shell"
import { requirePlatformAdmin } from "@/lib/auth"

// The platform admin area. Customers get a plain 404 (requirePlatformAdmin), and nothing here is
// ever indexed or cached. Layouts don't re-render on client navigation, so every page and every
// /api/admin route checks the staff session again on its own; this check is not the only one.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Admin · Apex Bot" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // /admin/system must open while migrations are pending; every other page still sends staff to /database-update itself
  const admin = await requirePlatformAdmin("support", { outdatedSchema: true })
  const { user } = admin
  return <AdminShell user={{ name: user.displayName ?? user.username, email: user.email, platformRole: user.platformRole }}>{children}</AdminShell>
}
