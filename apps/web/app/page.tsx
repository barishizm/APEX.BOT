import { LandingSections } from "@/components/landing/sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import Hero from "@/components/ui/hero-button-expendable";
import { isSignedIn } from "@/lib/auth";

export default async function Home() {
  const signedIn = await isSignedIn();
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero signedIn={signedIn} />
        <LandingSections signedIn={signedIn} />
      </main>
      <SiteFooter />
    </>
  );
}
