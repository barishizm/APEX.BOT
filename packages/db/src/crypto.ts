import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto"

// scrypt from node:crypto: no native addon, and the parameters are stored in the
// hash so they can be raised later without invalidating existing passwords.
const LOG_N = 15
const R = 8
const P = 1
const KEY_LEN = 32

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** logN
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, LOG_N, R, P)
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, logN, r, p, salt, hash] = stored.split("$")
  if (algo !== "scrypt" || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const key = await derive(password, Buffer.from(salt, "base64"), Number(logN), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Burns the same scrypt time when the email is unknown, so response time
// doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | undefined
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password")
  await verifyPassword(password, await dummyHash)
}

export const newSessionToken = () => randomBytes(32).toString("base64url")

export const newVerificationCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0")

export const sha256 = (value: string) => createHash("sha256").update(value).digest()

// ---------- Authenticator app codes (TOTP, RFC 6238: SHA-1, 30 s steps, 6 digits) ----------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
export const TOTP_STEP_SECONDS = 30

/** A new authenticator secret: 20 random bytes as 32 base32 characters. */
export function newTotpSecret(): string {
  const bytes = randomBytes(20)
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

function base32Decode(secret: string): Buffer {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of secret) {
    const i = BASE32.indexOf(ch)
    if (i < 0) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP_SECONDS)

/** The 6-digit code for a secret at a given 30-second step. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(n).padStart(6, "0")
}

/**
 * The step a code matches, allowing one step of clock drift either way and never a step at or
 * before `lastStep` (a code is good once). Null when it doesn't match.
 */
export function matchTotp(secret: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const current = totpStep(now)
  for (const step of [current, current - 1, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue
    const expected = Buffer.from(totpCode(secret, step))
    if (timingSafeEqual(expected, Buffer.from(code.padEnd(6).slice(0, 6)))) return step
  }
  return null
}

// Authenticator secrets are stored sealed with AES-256-GCM under TOTP_ENCRYPTION_KEY, so a
// database dump alone can't produce codes. The user id is bound in as associated data, so a
// sealed secret copied onto another account doesn't open there.
const SEALED = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/
const PLAIN_SECRET = /^[A-Z2-7]{32}$/

function totpKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY
  if (!raw) throw new Error("TOTP_ENCRYPTION_KEY is not set, so two-step sign-in secrets can't be encrypted")
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32)")
  return key
}

/** Encrypts an authenticator secret for storage: "v1.<iv>.<tag>.<ciphertext>". */
export function sealTotpSecret(secret: string, userId: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", totpKey(), iv)
  cipher.setAAD(Buffer.from(userId))
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".")
}

/**
 * The secret from a stored value. `legacy` marks one saved unencrypted before sealing existed;
 * callers re-seal it. Throws when the value was tampered with or sealed under another key.
 */
export function openTotpSecret(stored: string, userId: string): { secret: string; legacy: boolean } {
  if (PLAIN_SECRET.test(stored)) return { secret: stored, legacy: true }
  const m = SEALED.exec(stored)
  if (!m) throw new Error("Unreadable two-step sign-in secret")
  const decipher = createDecipheriv("aes-256-gcm", totpKey(), Buffer.from(m[1], "base64url"))
  decipher.setAAD(Buffer.from(userId))
  decipher.setAuthTag(Buffer.from(m[2], "base64url"))
  const secret = Buffer.concat([decipher.update(Buffer.from(m[3], "base64url")), decipher.final()]).toString("utf8")
  return { secret, legacy: false }
}

/** A backup code like "k3m9p-x2c7w": 50 bits from an alphabet without look-alikes. */
export function newRecoveryCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
  const pick = () => Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("")
  return `${pick()}-${pick()}`
}

/** Recovery codes are compared without case, spaces or the dash. */
export const normalizeRecoveryCode = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, "")
