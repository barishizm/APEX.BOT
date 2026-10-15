import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Component as PricingSection } from "@/components/ui/pricing-section";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Apex Bot is free during the beta. See the Starter, Pro and Enterprise plans we'll offer at launch.",
};

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <PricingSection />
      </main>
      <SiteFooter />
    </>
  );
}
