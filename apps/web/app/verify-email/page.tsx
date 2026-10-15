import type { Metadata } from "next";
import { redirect } from "next/navigation";
import VerifyEmail from "@/components/ui/verify-email";
import { currentSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (session.user.emailVerified) redirect("/dashboard");
  return <VerifyEmail initialEmail={session.user.email} />;
}
