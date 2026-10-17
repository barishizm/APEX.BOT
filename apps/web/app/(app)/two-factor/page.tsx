import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { hasLoginChallenge } from "@apex/db"
import TwoFactor from "@/components/ui/two-factor"
import { challengeToken, safeNext } from "@/lib/auth"
import { db } from "@/lib/db"
import { localizePath } from "@/lib/i18n"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).account.twoStep.title }
}

// Second step of signing in, after the password or Google/GitHub; needs the challenge cookie
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await hasLoginChallenge(db(), await challengeToken()))) redirect(localizePath("/login", await requestLocale()))
  return <TwoFactor next={safeNext((await searchParams).next)} />
}
