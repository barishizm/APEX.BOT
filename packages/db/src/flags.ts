// Feature flags and their defaults, with no other imports, so the chat API can read the list
// without loading the rest of @apex/db. Staff set them in /admin/settings (platform-settings.ts).

/** Every flag there is, with its value until staff set one. Add a flag here, then read it with flagEnabled. */
export const FEATURE_FLAGS = {
  /** Embedding search next to the lexical one in the chat API (needs APEX_EMBEDDINGS as well). */
  hybrid_search: { default: true },
  /** Uploading PDF, Word and text files as knowledge sources in the dashboard. */
  file_uploads: { default: true },
  /**
   * Holding workspaces to their plan's monthly AI replies in the chat API (docs/adr/0003-billing.md).
   * Replies are counted either way; off until billing launches, so beta workspaces aren't cut off.
   */
  reply_quota: { default: false },
  /**
   * Holding workspaces to the rest of their plan (entitlements.ts): websites, models, branding,
   * topics to decline, lead capture and retention. Off until billing launches, since every beta
   * workspace is on Free.
   */
  plan_limits: { default: false },
  /**
   * Selling plans (docs/adr/0003-billing.md (g)): checkout in the dashboard, plan CTAs on the
   * pricing page, and launch copy instead of "free during the beta" on the marketing pages. Needs
   * the Paddle configuration as well; off until the launch date.
   */
  billing: { default: false },
  /**
   * Launch copy instead of "free during the beta" on the public pages and in llms.txt, before
   * plans are on sale (the launch announcement, ADR 0003 (g)). `billing` turns it on as well.
   */
  launch_copy: { default: false },
} as const satisfies Record<string, { default: boolean }>
export type FeatureFlag = keyof typeof FEATURE_FLAGS
export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
export const isFeatureFlag = (v: unknown): v is FeatureFlag => typeof v === "string" && Object.hasOwn(FEATURE_FLAGS, v)
