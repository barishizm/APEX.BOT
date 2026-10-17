"use client";

import { useI18n } from "@/components/i18n/provider";
import { RegisterButton } from "@/components/ui/login-button";
import { useSignedIn } from "@/lib/signed-in";

export function ClosingActions() {
  const { t } = useI18n();
  if (useSignedIn()) {
    return (
      <a href="/dashboard" className="btn btn--primary">
        {t.landing.closing.ctaSignedIn}
      </a>
    );
  }
  return <RegisterButton className="btn btn--primary">{t.landing.closing.cta}</RegisterButton>;
}
