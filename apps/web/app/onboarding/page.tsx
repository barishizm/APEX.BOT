import type { Metadata } from "next";
import Onboarding from "@/components/ui/onboarding";

export const metadata: Metadata = { title: "Get started — Apex Bot" };

export default function OnboardingPage() {
  return <Onboarding />;
}
