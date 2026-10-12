import type { Metadata } from "next";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { requireVerifiedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard — Apex Bot" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireVerifiedUser();
  const { welcome } = await searchParams;
  return <DashboardShell intro={welcome === "1"} user={{ username: user.username, email: user.email }} />;
}
