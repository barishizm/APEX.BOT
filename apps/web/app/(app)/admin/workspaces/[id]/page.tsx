import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdminWorkspaceBilling, getAdminWorkspaceDetail } from "@apex/db"
import { WorkspaceDetail, type WorkspaceBillingJson, type WorkspaceDetailJson } from "@/components/admin/workspace-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { paddleDashboardUrl } from "@/lib/billing"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).workspaces.detail.title }
}

export default async function AdminWorkspacePage({ params }: PageProps<"/admin/workspaces/[id]">) {
  await requirePlatformAdmin()
  const id = (await params).id
  const [detail, billing] = await Promise.all([getAdminWorkspaceDetail(db(), id), getAdminWorkspaceBilling(db(), id)])
  if (!detail || !billing) notFound()
  const links = {
    subscription: billing.subscription ? paddleDashboardUrl("subscription", billing.subscription.providerSubscriptionId) : null,
    customer: billing.customerId ? paddleDashboardUrl("customer", billing.customerId) : null,
  }
  // Dates become ISO strings, as the client would get them from an API
  const json = JSON.parse(JSON.stringify(detail)) as WorkspaceDetailJson
  const billingJson = JSON.parse(JSON.stringify({ ...billing, links })) as WorkspaceBillingJson
  return <WorkspaceDetail detail={json} billing={billingJson} />
}
