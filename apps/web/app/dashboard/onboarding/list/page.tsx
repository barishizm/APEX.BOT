import type { Metadata } from "next";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { OnboardingList } from "@/components/ui/onboarding-list";

export const metadata: Metadata = { title: "Setup — Apex Bot" };

export default function OnboardingListPage() {
  return (
    <DashboardShell>
      <OnboardingList />
    </DashboardShell>
  );
}
