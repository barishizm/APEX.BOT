import type { Metadata } from "next"
import ForgotPassword from "@/components/ui/forgot-password"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).account.reset.title }
}

export default function ForgotPasswordPage() {
  return <ForgotPassword />
}
