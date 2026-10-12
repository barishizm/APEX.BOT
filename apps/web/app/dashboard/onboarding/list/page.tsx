import type { Metadata } from "next";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { OnboardingList } from "@/components/ui/onboarding-list";
import { requireVerifiedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Setup — Apex Bot" };

export default async function OnboardingListPage() {
  const user = await requireVerifiedUser();
  return (
    <DashboardShell user={{ username: user.username, email: user.email }}>
      <OnboardingList />
    </DashboardShell>
  );
}
