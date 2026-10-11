import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import SystemStatusBlock from "@/components/ui/system-status-block";

export const metadata: Metadata = { title: "System Status — Apex Bot" };

export default function StatusPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] px-6 py-24">
        <SystemStatusBlock />
      </main>
    </>
  );
}
