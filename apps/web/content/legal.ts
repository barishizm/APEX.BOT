import { BETA_PLACEMENT_DAYS, GRACE_DAYS } from "@apex/db"
import { OVERAGE_BLOCK } from "@apex/db/plans"
import { LOCALE_META, type Locale } from "@/lib/i18n"

// The billing numbers the Terms quote, from the constants billing runs on (docs/adr/0003-billing.md),
// so the legal pages can't promise something else than the code does.

/** Days after a subscription's first payment, or a yearly renewal, in which a refund can be asked for. */
export const REFUND_DAYS = 14
/** Least notice before a price change reaches a subscription, or before launch (ADR 0003 (a), (g)). */
export const NOTICE_DAYS = 30

export function billingTerms(locale: Locale) {
  const { intl } = LOCALE_META[locale]
  return {
    blockPrice: new Intl.NumberFormat(intl, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(
      OVERAGE_BLOCK.priceCents / 100,
    ),
    blockReplies: new Intl.NumberFormat(intl).format(OVERAGE_BLOCK.replies),
    graceDays: GRACE_DAYS,
    betaDays: BETA_PLACEMENT_DAYS,
    refundDays: REFUND_DAYS,
    noticeDays: NOTICE_DAYS,
  }
}
