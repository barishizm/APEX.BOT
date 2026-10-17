import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto"

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

/** A backup code like "k3m9p-x2c7w": 50 bits from an alphabet without look-alikes. */
export function newRecoveryCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
  const pick = () => Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("")
  return `${pick()}-${pick()}`
}

/** Recovery codes are compared without case, spaces or the dash. */
export const normalizeRecoveryCode = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, "")
