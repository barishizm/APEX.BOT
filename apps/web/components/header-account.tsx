"use client";

import { useI18n } from "@/components/i18n/provider";
import LoginButton, { RegisterButton } from "@/components/ui/login-button";
import { useSignedIn } from "@/lib/signed-in";

// Decided in the browser so the page itself can be prerendered once for everyone
export function HeaderAccount() {
  const { t } = useI18n();
  if (useSignedIn()) {
    return (
      <a href="/dashboard" className="bar__cta">
        {t.common.dashboard}
      </a>
    );
  }
  return (
    <>
      <LoginButton />
      <RegisterButton className="bar__cta bar__cta--wide" />
    </>
  );
}
