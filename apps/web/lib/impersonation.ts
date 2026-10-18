// "View as user" (packages/db/src/impersonation.ts) is read-only. The proxy refuses every request
// that could change something while the impersonation cookie is present, whether or not it is
// still valid, so no route has to remember to check. Kept free of server-only imports: the proxy
// loads it.

export const IMPERSONATION_COOKIE = "apex_impersonation"
/** The one write allowed while viewing as a user: ending the view. */
export const IMPERSONATION_EXIT_PATH = "/api/admin/impersonation/exit"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** Whether a request must be refused because a read-only impersonation is open in this browser. */
export function impersonationBlocks(method: string, pathname: string, impersonating: boolean): boolean {
  if (!impersonating || SAFE_METHODS.has(method.toUpperCase())) return false
  return pathname.replace(/\/+$/, "") !== IMPERSONATION_EXIT_PATH
}

export const IMPERSONATION_READ_ONLY = {
  error: "impersonation_read_only",
  message: "You're viewing the app as this user, read-only. Exit the view to make changes",
} as const
