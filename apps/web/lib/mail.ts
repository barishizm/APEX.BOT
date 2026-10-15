// Transactional email. With RESEND_API_KEY set, mail goes out through Resend; without it,
// development prints messages to the server log and production logs an error.

interface Mail {
  to: string
  subject: string
  text: string
}

async function send(mail: Mail) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[mail] RESEND_API_KEY is not set; "${mail.subject}" was not sent`)
      return
    }
    console.log(`[mail] to ${mail.to} · ${mail.subject}\n${mail.text}`)
    return
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "Apex Bot <no-reply@apexbot.eu>", to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => {
    console.error("[mail] couldn't reach the email provider:", err instanceof Error ? err.message : err)
    return null
  })
  if (res && !res.ok) console.error(`[mail] the email provider refused the message (${res.status})`)
}

const footer = "\n\nIf you didn't ask for this, you can ignore this email.\n\nApex Bot"

export function sendVerificationCode(email: string, code: string) {
  return send({
    to: email,
    subject: `${code} is your Apex Bot verification code`,
    text: `Your verification code is ${code}\n\nEnter it on the verification page to confirm your email. It expires in 15 minutes.${footer}`,
  })
}

export function sendPasswordResetCode(email: string, code: string) {
  return send({
    to: email,
    subject: `${code} is your Apex Bot password reset code`,
    text: `Someone asked to reset the password for your Apex Bot account.\n\nYour code is ${code}\n\nEnter it on the reset page to choose a new password. It expires in 15 minutes.${footer}`,
  })
}

export function sendHandoffConfirmationCode(email: string, code: string) {
  return send({
    to: email,
    subject: `${code} is your Apex Bot hand-off confirmation code`,
    text: `Someone asked to send chatbot hand-off emails to this address.\n\nYour confirmation code is ${code}\n\nEnter it in the Apex Bot dashboard to confirm. It expires in 15 minutes. If you don't recognise this, ignore this email and no hand-offs will be sent here.${footer}`,
  })
}

export function sendAccountExistsNotice(email: string) {
  return send({
    to: email,
    subject: "You already have an Apex Bot account",
    text: `Someone tried to sign up for Apex Bot with this email address, but an account already exists.\n\nIf it was you, just log in. If you forgot your password, use "Forgot password" on the login page. No changes were made to your account.${footer}`,
  })
}
