import type { Metadata } from "next";
import VerifyEmail from "@/components/ui/verify-email";

export const metadata: Metadata = { title: "Verify your email — Apex Bot" };

export default function VerifyEmailPage() {
  return <VerifyEmail />;
}
