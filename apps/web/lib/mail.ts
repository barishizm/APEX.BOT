// Transactional email. With RESEND_API_KEY set, mail goes out through Resend; without it,
// development prints messages to the server log and production logs an error.

import type { Locale } from "@/lib/i18n"
import type { Messages } from "@/lib/i18n/app/types"

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

// Sent in the language the person was using when they asked for it
const EMAILS: Messages<{
  footer: string
  verification: (code: string) => { subject: string; text: string }
  passwordReset: (code: string) => { subject: string; text: string }
  handoffConfirmation: (code: string) => { subject: string; text: string }
  accountExists: { subject: string; text: string }
}> = {
  en: {
    footer: "\n\nIf you didn't ask for this, you can ignore this email.\n\nApex Bot",
    verification: (code) => ({
      subject: `${code} is your Apex Bot verification code`,
      text: `Your verification code is ${code}\n\nEnter it on the verification page to confirm your email. It expires in 15 minutes.`,
    }),
    passwordReset: (code) => ({
      subject: `${code} is your Apex Bot password reset code`,
      text: `Someone asked to reset the password for your Apex Bot account.\n\nYour code is ${code}\n\nEnter it on the reset page to choose a new password. It expires in 15 minutes.`,
    }),
    handoffConfirmation: (code) => ({
      subject: `${code} is your Apex Bot hand-off confirmation code`,
      text: `Someone asked to send chatbot hand-off emails to this address.\n\nYour confirmation code is ${code}\n\nEnter it in the Apex Bot dashboard to confirm. It expires in 15 minutes. If you don't recognise this, ignore this email and no hand-offs will be sent here.`,
    }),
    accountExists: {
      subject: "You already have an Apex Bot account",
      text: `Someone tried to sign up for Apex Bot with this email address, but an account already exists.\n\nIf it was you, just log in. If you forgot your password, use "Forgot password" on the login page. No changes were made to your account.`,
    },
  },
  tr: {
    footer: "\n\nBunu siz istemediyseniz bu e-postayı yok sayabilirsiniz.\n\nApex Bot",
    verification: (code) => ({
      subject: `Apex Bot doğrulama kodunuz: ${code}`,
      text: `Doğrulama kodunuz: ${code}\n\nE-postanızı onaylamak için bu kodu doğrulama sayfasına girin. Kodun geçerlilik süresi 15 dakikadır.`,
    }),
    passwordReset: (code) => ({
      subject: `Apex Bot şifre sıfırlama kodunuz: ${code}`,
      text: `Apex Bot hesabınızın şifresini sıfırlama talebinde bulunuldu.\n\nKodunuz: ${code}\n\nYeni bir şifre belirlemek için bu kodu sıfırlama sayfasına girin. Kodun geçerlilik süresi 15 dakikadır.`,
    }),
    handoffConfirmation: (code) => ({
      subject: `Apex Bot insana devir onay kodunuz: ${code}`,
      text: `Chatbot devir e-postalarının bu adrese gönderilmesi istendi.\n\nOnay kodunuz: ${code}\n\nOnaylamak için bu kodu Apex Bot paneline girin. Kodun geçerlilik süresi 15 dakikadır. Bu isteği tanımıyorsanız e-postayı yok sayın; bu adrese devir e-postası gönderilmez.`,
    }),
    accountExists: {
      subject: "Zaten bir Apex Bot hesabınız var",
      text: `Bu e-posta adresiyle Apex Bot'a kaydolmaya çalışıldı, ancak bu adrese ait bir hesap zaten var.\n\nBu sizseniz giriş yapmanız yeterli. Şifrenizi unuttuysanız giriş sayfasındaki "Şifrenizi mi unuttunuz?" bağlantısını kullanın. Hesabınızda hiçbir değişiklik yapılmadı.`,
    },
  },
}

function compose(to: string, locale: Locale, mail: { subject: string; text: string }) {
  return send({ to, subject: mail.subject, text: mail.text + EMAILS[locale].footer })
}

export function sendVerificationCode(email: string, code: string, locale: Locale) {
  return compose(email, locale, EMAILS[locale].verification(code))
}

export function sendPasswordResetCode(email: string, code: string, locale: Locale) {
  return compose(email, locale, EMAILS[locale].passwordReset(code))
}

export function sendHandoffConfirmationCode(email: string, code: string, locale: Locale) {
  return compose(email, locale, EMAILS[locale].handoffConfirmation(code))
}

export function sendAccountExistsNotice(email: string, locale: Locale) {
  return compose(email, locale, EMAILS[locale].accountExists)
}
