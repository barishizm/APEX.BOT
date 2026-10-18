import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdminWorkspaceDetail } from "@apex/db"
import { WorkspaceDetail, type WorkspaceDetailJson } from "@/components/admin/workspace-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).workspaces.detail.title }
}

export default async function AdminWorkspacePage({ params }: PageProps<"/admin/workspaces/[id]">) {
  await requirePlatformAdmin()
  const detail = await getAdminWorkspaceDetail(db(), (await params).id)
  if (!detail) notFound()
  // Dates become ISO strings, as the client would get them from an API
  const json = JSON.parse(JSON.stringify(detail)) as WorkspaceDetailJson
  return <WorkspaceDetail detail={json} />
}
