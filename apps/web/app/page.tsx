import { SiteHeader } from "@/components/site-header";
import Hero from "@/components/ui/hero-button-expendable";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
      </main>
    </>
  );
}
