import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SystemStatus } from "@/components/ui/system-status";
import { checkServices } from "@/lib/status";

export const metadata: Metadata = { title: "System status", description: "Live status of the Apex Bot dashboard, chat API and widget." };

export default async function StatusPage() {
  await connection(); // checked on every visit, never prerendered
  const checks = await checkServices();
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex min-h-[80vh] justify-center bg-[var(--color-surface)] px-6 pb-24 pt-32 sm:pt-40">
        <SystemStatus checks={checks} checkedAt={new Date()} />
      </main>
      <SiteFooter />
    </>
  );
}
