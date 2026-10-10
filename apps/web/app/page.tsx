import { MegaMenu } from "@/components/mega-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import Hero from "@/components/ui/hero-button-expendable";

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="bar">
        <a href="/" className="logo" aria-label="Apex Bot home">
          <span className="logo__mark" aria-hidden="true" />
        </a>
        <MegaMenu />
        <nav className="bar__nav" aria-label="Main menu">
          <a href="/giris" className="bar__link">
            Log in
          </a>
          <AnimatedThemeToggler />
        </nav>
      </header>

      <main id="main">
        <Hero />
      </main>
    </>
  );
}
