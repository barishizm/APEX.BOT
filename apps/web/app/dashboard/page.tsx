import type { Metadata } from "next";
import { DashboardShell } from "@/components/ui/dashboard-shell";

export const metadata: Metadata = { title: "Dashboard — Apex Bot" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  return <DashboardShell intro={welcome === "1"} />;
}
