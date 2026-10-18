import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdminBotDetail } from "@apex/db"
import { BotDetail, type BotDetailJson } from "@/components/admin/bot-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).bots.detail.title }
}

export default async function AdminBotPage({ params }: PageProps<"/admin/bots/[id]">) {
  await requirePlatformAdmin()
  const detail = await getAdminBotDetail(db(), (await params).id)
  if (!detail) notFound()
  // Dates become ISO strings, as the client would get them from an API
  const json = JSON.parse(JSON.stringify(detail)) as BotDetailJson
  return <BotDetail detail={json} />
}
