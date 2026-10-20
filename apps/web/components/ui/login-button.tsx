"use client";

import { useI18n } from "@/components/i18n/provider";

type AuthMode = "login" | "register";

// The auth modal lives in the page's Hero; it grows out of the clicked element. `next` is where to
// go once signed in (lib/next-path.ts decides what's allowed).
export function openAuth(mode: AuthMode, from?: Element | null, next?: string) {
  const r = from?.getBoundingClientRect();
  const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  window.dispatchEvent(new CustomEvent(`apex:open-${mode}`, { detail: { ...at, ...(next !== undefined && { next }) } }));
}

// Without JS the link still works: /login opens the same modal after hydration
export default function LoginButton({ className = "bar__link", children }: { className?: string; children?: React.ReactNode }) {
  const { t, href } = useI18n();
  return (
    <a
      href={href("/login")}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        openAuth("login", e.currentTarget);
      }}
    >
      {children ?? t.common.logIn}
    </a>
  );
}

export function RegisterButton({ className = "bar__cta", children }: { className?: string; children?: React.ReactNode }) {
  const { t, href } = useI18n();
  return (
    <a
      href={href("/signup")}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        openAuth("register", e.currentTarget);
      }}
    >
      {children ?? t.common.getStarted}
    </a>
  );
}
