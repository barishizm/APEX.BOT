import QRCode from "qrcode"
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, requireSession } from "@/lib/auth"

// Starts the setup: a new secret and its QR code. Not in force until PUT confirms a code.
export async function POST() {
  try {
    const session = await requireSession()
    const { secret, uri } = await beginTwoFactorSetup(db(), session.user.id)
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
    return Response.json({ secret, qr })
  } catch (err) {
    return authErrorResponse(err)
  }
}

// Body: { code } from the authenticator. Turns it on and returns the recovery codes, shown once.
export async function PUT(request: Request) {
  try {
    const session = await requireSession()
    const { code } = await readJson(request)
    return Response.json(await enableTwoFactor(db(), session.user.id, code, await requestMeta()))
  } catch (err) {
    return authErrorResponse(err)
  }
}

// Body: { code }, an authenticator or recovery code. Turns two-step sign-in off.
export async function DELETE(request: Request) {
  try {
    const session = await requireSession()
    const { code } = await readJson(request)
    await disableTwoFactor(db(), session.user.id, code, await requestMeta())
    return new Response(null, { status: 204 })
  } catch (err) {
    return authErrorResponse(err)
  }
}
