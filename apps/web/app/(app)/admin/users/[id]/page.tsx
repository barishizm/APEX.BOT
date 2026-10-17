import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdminUserDetail } from "@apex/db"
import { UserDetail, type UserDetailJson } from "@/components/admin/user-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).users.detail.title }
}

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const admin = await requirePlatformAdmin()
  const detail = await getAdminUserDetail(db(), (await params).id)
  if (!detail) notFound()
  // Dates become ISO strings, as the client would get them from an API
  const json = JSON.parse(JSON.stringify(detail)) as UserDetailJson
  return <UserDetail detail={json} viewer={{ id: admin.user.id, role: admin.user.platformRole }} />
}
