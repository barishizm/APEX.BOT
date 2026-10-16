import { AuthError } from "@apex/db"

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/**
 * Cloudflare Turnstile check for endpoints bots abuse to burn money (sign-up sends mail and
 * opens an account that can use the chat API). Without TURNSTILE_SECRET_KEY the check is off,
 * so local development needs no keys. With it set, a missing, reused or failed token is refused,
 * and so is a Cloudflare outage (fail closed).
 */
export async function requireHuman(token: unknown, ip?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return
  const fail = () => new AuthError("invalid_input", "Couldn't verify you're human. Reload the page and try again")
  if (typeof token !== "string" || !token || token.length > 2048) throw fail()

  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set("remoteip", ip)
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) })
    const data = (await res.json()) as { success?: boolean }
    if (data.success !== true) throw fail()
  } catch (err) {
    if (err instanceof AuthError) throw err
    console.error("[turnstile]", err)
    throw fail()
  }
}
