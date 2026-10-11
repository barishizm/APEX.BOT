import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Component as PricingSection } from "@/components/ui/pricing-section";

export const metadata: Metadata = { title: "Pricing — Apex Bot" };

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <PricingSection />
      </main>
    </>
  );
}
