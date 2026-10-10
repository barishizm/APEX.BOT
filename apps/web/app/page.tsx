import { MegaMenu } from "@/components/mega-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import LoginButton from "@/components/ui/login-button";
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
          <LoginButton />
          <AnimatedThemeToggler />
        </nav>
      </header>

      <main id="main">
        <Hero />
      </main>
    </>
  );
}
