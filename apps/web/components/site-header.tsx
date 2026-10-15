import { MegaMenu } from "@/components/mega-menu";
import { MobileMenu } from "@/components/mobile-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { AuthModalHost } from "@/components/ui/auth-modal-host";
import LoginButton, { RegisterButton } from "@/components/ui/login-button";
import { isSignedIn } from "@/lib/auth";

export async function SiteHeader() {
  const signedIn = await isSignedIn();
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
        <nav className="bar__nav" aria-label="Account">
          {signedIn ? (
            <a href="/dashboard" className="bar__cta">
              Dashboard
            </a>
          ) : (
            <>
              <LoginButton />
              <RegisterButton className="bar__cta bar__cta--wide" />
            </>
          )}
          <AnimatedThemeToggler />
          <MobileMenu signedIn={signedIn} />
        </nav>
      </header>
      <AuthModalHost />
    </>
  );
}
