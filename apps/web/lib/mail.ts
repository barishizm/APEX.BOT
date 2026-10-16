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
  lt: {
    footer: "\n\nJei to neprašėte, šį laišką galite ignoruoti.\n\nApex Bot",
    verification: (code) => ({
      subject: `Jūsų Apex Bot patvirtinimo kodas: ${code}`,
      text: `Jūsų patvirtinimo kodas: ${code}\n\nĮveskite jį patvirtinimo puslapyje, kad patvirtintumėte savo el. pašto adresą. Kodas galioja 15 minučių.`,
    }),
    passwordReset: (code) => ({
      subject: `Jūsų Apex Bot slaptažodžio atkūrimo kodas: ${code}`,
      text: `Gautas prašymas atkurti jūsų Apex Bot paskyros slaptažodį.\n\nJūsų kodas: ${code}\n\nĮveskite jį atkūrimo puslapyje ir pasirinkite naują slaptažodį. Kodas galioja 15 minučių.`,
    }),
    handoffConfirmation: (code) => ({
      subject: `Jūsų Apex Bot perdavimo patvirtinimo kodas: ${code}`,
      text: `Gautas prašymas siųsti pokalbių roboto perdavimo laiškus šiuo adresu.\n\nJūsų patvirtinimo kodas: ${code}\n\nNorėdami patvirtinti, įveskite jį Apex Bot valdymo skydelyje. Kodas galioja 15 minučių. Jei šio prašymo neatpažįstate, ignoruokite šį laišką – perdavimo laiškai šiuo adresu nebus siunčiami.`,
    }),
    accountExists: {
      subject: "Jūs jau turite Apex Bot paskyrą",
      text: `Kažkas bandė užsiregistruoti Apex Bot naudodamas šį el. pašto adresą, tačiau paskyra su juo jau yra.\n\nJei tai buvote jūs, tiesiog prisijunkite. Jei pamiršote slaptažodį, prisijungimo puslapyje spustelėkite „Pamiršote slaptažodį?“. Jūsų paskyroje niekas nepakeista.`,
    },
  },
  lv: {
    footer: "\n\nJa jūs to nepieprasījāt, varat šo e-pastu ignorēt.\n\nApex Bot",
    verification: (code) => ({
      subject: `Jūsu Apex Bot apstiprinājuma kods: ${code}`,
      text: `Jūsu apstiprinājuma kods: ${code}\n\nIevadiet to apstiprināšanas lapā, lai apstiprinātu savu e-pasta adresi. Kods ir derīgs 15 minūtes.`,
    }),
    passwordReset: (code) => ({
      subject: `Jūsu Apex Bot paroles atiestatīšanas kods: ${code}`,
      text: `Saņemts pieprasījums atiestatīt jūsu Apex Bot konta paroli.\n\nJūsu kods: ${code}\n\nIevadiet to atiestatīšanas lapā, lai izvēlētos jaunu paroli. Kods ir derīgs 15 minūtes.`,
    }),
    handoffConfirmation: (code) => ({
      subject: `Jūsu Apex Bot nodošanas apstiprinājuma kods: ${code}`,
      text: `Saņemts pieprasījums sūtīt tērzēšanas robota nodošanas e-pastus uz šo adresi.\n\nJūsu apstiprinājuma kods: ${code}\n\nLai apstiprinātu, ievadiet to Apex Bot vadības panelī. Kods ir derīgs 15 minūtes. Ja jūs šo pieprasījumu neatpazīstat, ignorējiet šo e-pastu – nodošanas e-pasti uz šo adresi netiks sūtīti.`,
    }),
    accountExists: {
      subject: "Jums jau ir Apex Bot konts",
      text: `Kāds mēģināja reģistrēties Apex Bot ar šo e-pasta adresi, taču konts ar to jau pastāv.\n\nJa tas bijāt jūs, vienkārši piesakieties. Ja aizmirsāt paroli, pieteikšanās lapā izmantojiet saiti “Aizmirsāt paroli?”. Jūsu kontā nekas netika mainīts.`,
    },
  },
  et: {
    footer: "\n\nKui te seda ei taotlenud, võite selle e-kirja tähelepanuta jätta.\n\nApex Bot",
    verification: (code) => ({
      subject: `Teie Apex Boti kinnituskood: ${code}`,
      text: `Teie kinnituskood: ${code}\n\nSisestage see kinnituslehel, et oma e-posti aadress kinnitada. Kood kehtib 15 minutit.`,
    }),
    passwordReset: (code) => ({
      subject: `Teie Apex Boti parooli lähtestamise kood: ${code}`,
      text: `Saime taotluse teie Apex Boti konto parooli lähtestamiseks.\n\nTeie kood: ${code}\n\nSisestage see lähtestamise lehel ja valige uus parool. Kood kehtib 15 minutit.`,
    }),
    handoffConfirmation: (code) => ({
      subject: `Teie Apex Boti üleandmise kinnituskood: ${code}`,
      text: `Saime taotluse saata sellele aadressile vestlusroboti üleandmiskirju.\n\nTeie kinnituskood: ${code}\n\nKinnitamiseks sisestage see Apex Boti töölaual. Kood kehtib 15 minutit. Kui te seda taotlust ei tunne, jätke see e-kiri tähelepanuta – sellele aadressile üleandmiskirju ei saadeta.`,
    }),
    accountExists: {
      subject: "Teil on juba Apex Boti konto",
      text: `Keegi proovis selle e-posti aadressiga Apex Botis registreeruda, kuid sellega seotud konto on juba olemas.\n\nKui see olite teie, logige lihtsalt sisse. Kui olete parooli unustanud, kasutage sisselogimislehel linki „Unustasite parooli?“. Teie kontol ei muudetud midagi.`,
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
