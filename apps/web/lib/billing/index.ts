import { readBillingConfig, type BillingStatus } from "./config.ts"
import { createPaddleProvider } from "./paddle.ts"
import { BillingError, type BillingProvider } from "./types.ts"

export * from "./types.ts"
export { BILLING_ENV_KEYS, type BillingStatus } from "./config.ts"

/** Whether billing is on, and if not, which variables are missing or wrong. Never throws. */
export function billingStatus(env: Record<string, string | undefined> = process.env): BillingStatus {
  return readBillingConfig(env).status
}

/** The configured provider, or null while billing is off; callers show "billing is off" instead of failing. */
export function getBillingProvider(env: Record<string, string | undefined> = process.env): BillingProvider | null {
  const { config } = readBillingConfig(env)
  return config ? createPaddleProvider(config) : null
}

/** The configured provider, or BillingError("disabled") for routes that can't do anything without one. */
export function requireBillingProvider(env: Record<string, string | undefined> = process.env): BillingProvider {
  const provider = getBillingProvider(env)
  if (!provider) throw new BillingError("disabled", "Billing is not configured")
  return provider
}
