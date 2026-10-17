import type { Metadata } from "next";
import { localizePath } from "@/lib/i18n";
import { redirect } from "next/navigation";
import VerifyEmail from "@/components/ui/verify-email";
import { currentSession, safeNext } from "@/lib/auth";
import { getAppDictionary } from "@/lib/i18n/app";
import { requestLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).account.verify.title };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await currentSession();
  const next = safeNext((await searchParams).next);
  if (!session) redirect(localizePath("/login", await requestLocale()));
  if (session.user.emailVerified) redirect(next ?? "/dashboard");
  return <VerifyEmail initialEmail={session.user.email} next={next} />;
}
