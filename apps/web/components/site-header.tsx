import { MegaMenu } from "@/components/mega-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { AuthModalHost } from "@/components/ui/auth-modal-host";
import LoginButton from "@/components/ui/login-button";

export function SiteHeader() {
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
      <AuthModalHost />
    </>
  );
}
