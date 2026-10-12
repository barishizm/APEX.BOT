import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto"

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
