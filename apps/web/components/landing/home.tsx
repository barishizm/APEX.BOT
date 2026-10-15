import { LandingSections } from "@/components/landing/sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import Hero from "@/components/ui/hero-button-expendable";
import { isSignedIn } from "@/lib/auth";

// The landing page; /login and /signup render it with the auth modal already open
export async function Home({ initialAuth, initialError }: { initialAuth?: "login" | "register"; initialError?: string }) {
  const signedIn = await isSignedIn();
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero signedIn={signedIn} initialAuth={signedIn ? undefined : initialAuth} initialError={initialError} />
        <LandingSections signedIn={signedIn} />
      </main>
      <SiteFooter />
    </>
  );
}
