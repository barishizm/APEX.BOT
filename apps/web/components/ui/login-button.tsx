"use client";

type AuthMode = "login" | "register";

// The auth modal lives in the page's Hero; it grows out of the clicked element.
export function openAuth(mode: AuthMode, from?: Element | null) {
  const r = from?.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent(`apex:open-${mode}`, {
      detail: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    }),
  );
}

// Without JS the link still works: /?login=1 opens the same modal after hydration
export default function LoginButton({ className = "bar__link", children = "Log in" }: { className?: string; children?: React.ReactNode }) {
  return (
    <a
      href="/?login=1"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        openAuth("login", e.currentTarget);
      }}
    >
      {children}
    </a>
  );
}

export function RegisterButton({ className = "bar__cta", children = "Get started" }: { className?: string; children?: React.ReactNode }) {
  return (
    <a
      href="/?signup=1"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        openAuth("register", e.currentTarget);
      }}
    >
      {children}
    </a>
  );
}
