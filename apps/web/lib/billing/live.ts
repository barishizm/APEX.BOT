import { featureEnabled } from "@apex/db"
import { db } from "@/lib/db"
import { billingStatus } from "./index"

/**
 * Whether plans are on sale: the Paddle configuration is complete and staff turned the billing flag
 * on (for the workspace, when one is given). Never throws: a database that can't be reached, as
 * during a build without DATABASE_URL, reads as "not yet", so the public pages keep the beta copy.
 */
export async function billingLive(organizationId?: string | null): Promise<boolean> {
  if (!billingStatus().enabled) return false
  try {
    return await featureEnabled(db(), "billing", organizationId)
  } catch {
    return false
  }
}

/**
 * Whether the public pages drop the beta wording: plans are on sale, or staff turned the launch_copy
 * flag on ahead of that (the launch announcement). Never throws, like billingLive.
 */
export async function launchCopyLive(): Promise<boolean> {
  try {
    if (await featureEnabled(db(), "launch_copy")) return true
  } catch {
    return false
  }
  return billingLive()
}
