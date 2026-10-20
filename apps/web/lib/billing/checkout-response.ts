import { errorJson } from "@/lib/auth"
import { botErrorResponse } from "@/lib/bot"
import { CheckoutRefused } from "./checkout"
import { BillingError } from "./types"

// The checkout routes' errors as JSON the billing page reads by `error` code (lib/i18n/app/billing.ts)
export async function checkoutErrorResponse(err: unknown) {
  if (err instanceof CheckoutRefused) return errorJson(err.code, err.message, { status: err.status })
  if (err instanceof BillingError) {
    if (err.code === "invalid_input") return errorJson("invalid_input", err.message, { status: 400 })
    // nothing from the provider's answer reaches the browser or the log beyond its code
    console.error("[billing] checkout", err.code, err.details.providerCode ?? "", err.details.requestId ?? "")
    return errorJson("provider_error", "Couldn't reach the payment provider. Try again", { status: 502 })
  }
  return botErrorResponse(err)
}
