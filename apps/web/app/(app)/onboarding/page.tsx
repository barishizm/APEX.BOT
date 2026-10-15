import type { Metadata } from "next";
import Onboarding from "@/components/ui/onboarding";
import { requireVerifiedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  await requireVerifiedUser();
  return <Onboarding />;
}
