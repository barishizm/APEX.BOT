import { HeaderAccount } from "@/components/header-account";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { MegaMenu } from "@/components/mega-menu";
import { MobileMenu } from "@/components/mobile-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { AuthModalHost } from "@/components/ui/auth-modal-host";
import { localizePath, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/server";

// `authModal` is off on pages whose Hero already hosts the login/sign-up modal
export function SiteHeader({ locale, authModal = true }: { locale: Locale; authModal?: boolean }) {
  const t = getDictionary(locale);
  return (
    <>
      <a className="skip" href="#main">
        {t.common.skipToContent}
      </a>

      <header className="bar">
        <a href={localizePath("/", locale)} className="logo" aria-label={t.common.homeLabel}>
          <span className="logo__mark" aria-hidden="true" />
        </a>
        <MegaMenu />
        <nav className="bar__nav" aria-label={t.common.account}>
          <HeaderAccount />
          <LanguageSwitcher className="lang--bar" />
          <AnimatedThemeToggler />
          <MobileMenu />
        </nav>
      </header>
      {authModal && <AuthModalHost />}
    </>
  );
}
