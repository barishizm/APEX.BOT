import { createHash, randomBytes } from "node:crypto"
import type { OAuthProfile, OAuthProvider } from "@apex/db"

export const OAUTH_COOKIE = "apex_oauth"
export const PROVIDERS: readonly OAuthProvider[] = ["google", "github"]

export const isProvider = (v: string): v is OAuthProvider => (PROVIDERS as readonly string[]).includes(v)

// Public origin the provider redirects back to; must match what is registered with the provider
export const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")
export const redirectUri = (p: OAuthProvider) => `${siteOrigin()}/api/auth/oauth/${p}/callback`

export function credentials(p: OAuthProvider) {
  const id = process.env[`${p.toUpperCase()}_CLIENT_ID`]
  const secret = process.env[`${p.toUpperCase()}_CLIENT_SECRET`]
  return id && secret ? { id, secret } : null
}

export const newState = () => ({
  state: randomBytes(24).toString("base64url"),
  verifier: randomBytes(32).toString("base64url"),
})

export function authorizeUrl(p: OAuthProvider, id: string, state: string, verifier: string) {
  const q = new URLSearchParams({ client_id: id, redirect_uri: redirectUri(p), state })
  if (p === "google") {
    q.set("response_type", "code")
    q.set("scope", "openid email profile")
    q.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"))
    q.set("code_challenge_method", "S256")
    q.set("prompt", "select_account")
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
  }
  q.set("scope", "read:user user:email")
  return `https://github.com/login/oauth/authorize?${q}`
}

const timeout = () => AbortSignal.timeout(10_000)

async function json(res: Response) {
  if (!res.ok) throw new Error(`provider responded ${res.status}`)
  return res.json()
}

// Exchanges the code and returns the provider's identity, or throws
export async function fetchProfile(
  p: OAuthProvider,
  code: string,
  verifier: string,
  creds: { id: string; secret: string },
): Promise<Omit<OAuthProfile, "accountType">> {
  if (p === "google") {
    const token = await json(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: creds.id,
          client_secret: creds.secret,
          redirect_uri: redirectUri(p),
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
        signal: timeout(),
      }),
    )
    const me = await json(
      await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
        signal: timeout(),
      }),
    )
    return {
      provider: p,
      providerAccountId: String(me.sub),
      email: me.email,
      emailVerified: me.email_verified === true,
      username: typeof me.name === "string" ? me.name : undefined,
    }
  }

  const token = await json(
    await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code, client_id: creds.id, client_secret: creds.secret, redirect_uri: redirectUri(p) }),
      signal: timeout(),
    }),
  )
  if (!token.access_token) throw new Error("no access token")
  const headers = { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "apex-bot" }
  const me = await json(await fetch("https://api.github.com/user", { headers, signal: timeout() }))
  const emails: { email: string; primary: boolean; verified: boolean }[] = await json(
    await fetch("https://api.github.com/user/emails", { headers, signal: timeout() }),
  )
  // the profile email can be unverified or public-only; trust only the verified primary one
  const primary = emails.find((e) => e.primary && e.verified)
  return {
    provider: p,
    providerAccountId: String(me.id),
    email: primary?.email,
    emailVerified: Boolean(primary),
    username: typeof me.login === "string" ? me.login : undefined,
  }
}
