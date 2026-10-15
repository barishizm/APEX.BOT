"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LanguageLinks } from "@/components/i18n/language-switcher";
import { useI18n } from "@/components/i18n/provider";
import { buildNav } from "@/components/site-nav";
import { openAuth } from "@/components/ui/login-button";
import { useSignedIn } from "@/lib/signed-in";

// Below 900px the mega menu is hidden; this sheet carries the same links.
export function MobileMenu() {
  const { t, href } = useI18n();
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    // Growing past the breakpoint shows the desktop menu, so the sheet goes away
    const wide = window.matchMedia("(min-width: 900px)");
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", close);
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", close);
    };
  }, [open]);

  const auth = (mode: "login" | "register") => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setOpen(false);
    openAuth(mode, buttonRef.current);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="menu-toggle"
        aria-label={open ? t.common.closeMenu : t.common.openMenu}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
      </button>

      {open && (
        <div id="mobile-menu" ref={sheetRef} className="mobile-menu" role="dialog" aria-modal="true" aria-label={t.common.menu}>
          <nav aria-label={t.common.siteMenu} className="mobile-menu__nav">
            {buildNav(t).map((entry) =>
              entry.panel ? (
                <section key={entry.label} className="mobile-menu__group">
                  <p className="mobile-menu__heading">{entry.label}</p>
                  {/* the desktop panel repeats some destinations as icon shortcuts; list each once */}
                  {entry.panel.cols
                    .flatMap((col) => col.items)
                    .filter((item, i, all) => all.findIndex((other) => other.href === item.href) === i)
                    .map((item) => (
                      <a key={item.href} href={href(item.href)} className="mobile-menu__link" onClick={() => setOpen(false)}>
                        {item.title}
                      </a>
                    ))}
                </section>
              ) : (
                <a key={entry.label} href={href(entry.href)} className="mobile-menu__link mobile-menu__link--top" onClick={() => setOpen(false)}>
                  {entry.label}
                </a>
              ),
            )}
          </nav>
          <div className="mobile-menu__actions">
            {signedIn ? (
              <a href="/dashboard" className="btn btn--primary">
                {t.common.goToDashboard}
              </a>
            ) : (
              <>
                <a href={href("/signup")} className="btn btn--primary" onClick={auth("register")}>
                  {t.common.getStartedFree}
                </a>
                <a href={href("/login")} className="btn btn--ghost" onClick={auth("login")}>
                  {t.common.logIn}
                </a>
              </>
            )}
          </div>
          <LanguageLinks className="mobile-menu__lang" />
        </div>
      )}
    </>
  );
}
