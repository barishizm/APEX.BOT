import type { Metadata } from "next";
import { DashboardShell } from "@/components/ui/dashboard-shell";

export const metadata: Metadata = { title: "Dashboard — Apex Bot" };

export default function DashboardPage() {
  return <DashboardShell />;
}
