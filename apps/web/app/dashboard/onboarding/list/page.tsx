import type { Metadata } from "next";
import { getBotForUser } from "@apex/db";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { OnboardingList } from "@/components/ui/onboarding-list";
import { requireVerifiedUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Setup — Apex Bot" };

export default async function OnboardingListPage() {
  const user = await requireVerifiedUser();
  const bot = await getBotForUser(db(), user.id);
  return (
    <DashboardShell user={{ username: user.username, email: user.email }}>
      <OnboardingList testSite={bot.settings.security.allowedOrigins[0] ?? null} />
    </DashboardShell>
  );
}
