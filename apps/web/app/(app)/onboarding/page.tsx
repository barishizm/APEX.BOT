import type { Metadata } from "next";
import Onboarding from "@/components/ui/onboarding";
import { requireVerifiedUser } from "@/lib/auth";
import { getAppDictionary } from "@/lib/i18n/app";
import { requestLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).account.onboardingTitle };
}

export default async function OnboardingPage() {
  await requireVerifiedUser();
  return <Onboarding />;
}
