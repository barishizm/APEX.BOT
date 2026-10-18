// Feature flags and their defaults, with no other imports, so the chat API can read the list
// without loading the rest of @apex/db. Staff set them in /admin/settings (platform-settings.ts).

/** Every flag there is, with its value until staff set one. Add a flag here, then read it with flagEnabled. */
export const FEATURE_FLAGS = {
  /** Embedding search next to the lexical one in the chat API (needs APEX_EMBEDDINGS as well). */
  hybrid_search: { default: true },
  /** Uploading PDF, Word and text files as knowledge sources in the dashboard. */
  file_uploads: { default: true },
} as const satisfies Record<string, { default: boolean }>
export type FeatureFlag = keyof typeof FEATURE_FLAGS
export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
export const isFeatureFlag = (v: unknown): v is FeatureFlag => typeof v === "string" && Object.hasOwn(FEATURE_FLAGS, v)
