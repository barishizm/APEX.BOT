import { LandingSections } from "@/components/landing/sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import Hero from "@/components/ui/hero-button-expendable";
import type { Locale } from "@/lib/i18n";

// The landing page; /login and /signup render it with the auth modal already open
export function Home({ locale, initialAuth }: { locale: Locale; initialAuth?: "login" | "register" }) {
  return (
    <>
      <SiteHeader locale={locale} authModal={false} />
      <main id="main">
        <Hero initialAuth={initialAuth} />
        <LandingSections locale={locale} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
