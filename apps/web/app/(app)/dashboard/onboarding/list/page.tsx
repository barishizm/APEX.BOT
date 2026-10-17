import type { Metadata } from "next";
import { DashboardFrame } from "@/components/dashboard/frame";
import { OnboardingList } from "@/components/ui/onboarding-list";
import { getAppDictionary } from "@/lib/i18n/app";
import { requestLocale } from "@/lib/i18n/server";
import { buildStages } from "@/lib/setup-steps";
import { requireVerifiedUser } from "@/lib/auth";
import { currentBot, currentSources, getSetup, shownSite } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { listConversations } from "@apex/db";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).shell.nav.setup };
}

export default async function OnboardingListPage() {
  const user = await requireVerifiedUser();
  const [bot, sources, setup, conversations] = await Promise.all([
    currentBot(user.id),
    currentSources(user.id),
    getSetup(user.id),
    listConversations(db(), await shownSite(user.id), { limit: 1 }),
  ]);
  const h = bot.settings.handoff;
  const stages = buildStages(getAppDictionary(await requestLocale()).setup, {
    setup,
    testSite: bot.settings.security.allowedOrigins[0] ?? null,
    hasText: sources.some((s) => s.kind === "text" || s.kind === "file"),
    // an unconfirmed address is never mailed, so it doesn't count
    handoffOn: h.enabled && !!h.email && bot.handoffVerified,
    contactSet: !!h.contact,
    leadOn: h.leadCapture !== "off",
    hasConversations: conversations.conversations.length > 0,
  });
  return (
    <DashboardFrame active="Setup">
      <OnboardingList stages={stages} />
    </DashboardFrame>
  );
}
