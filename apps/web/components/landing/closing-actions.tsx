"use client";

import { useI18n } from "@/components/i18n/provider";
import { RegisterButton } from "@/components/ui/login-button";
import { useSignedIn } from "@/lib/signed-in";
import { SIGNUPS_OPEN } from "@/lib/signups";

// While sign-ups are closed, visitors are pointed at the waitlist, not promised a quick set-up
export function ClosingLede() {
  const { t } = useI18n();
  const signedIn = useSignedIn();
  return <p className="lede">{signedIn || SIGNUPS_OPEN ? t.landing.closing.lede : t.landing.closing.ledeWaitlist}</p>;
}

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
