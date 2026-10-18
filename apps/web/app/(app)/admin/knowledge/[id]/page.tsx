import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdminKnowledgeDetail } from "@apex/db"
import { KnowledgeDetail, type KnowledgeDetailJson } from "@/components/admin/knowledge-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { translateMessage } from "@/lib/i18n/messages"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).knowledge.detail.title }
}

export default async function AdminKnowledgeSourcePage({ params }: PageProps<"/admin/knowledge/[id]">) {
  await requirePlatformAdmin()
  const detail = await getAdminKnowledgeDetail(db(), (await params).id)
  if (!detail) notFound()
  const locale = await requestLocale()
  // the stored error is English (written by a background job), as on the owner's page
  const source = { ...detail.source, error: detail.source.error && translateMessage(detail.source.error, locale) }
  const json = JSON.parse(JSON.stringify({ ...detail, source })) as KnowledgeDetailJson
  return <KnowledgeDetail detail={json} />
}
