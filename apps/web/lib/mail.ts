// Transactional email. With RESEND_API_KEY set, mail goes out through Resend; without it,
// development prints messages to the server log and production logs an error. Mail that doesn't go
// out is also recorded, masked, in app.email_failures for /admin/system.

import { recordEmailFailure } from "@apex/db"
import { db } from "@/lib/db"
import type { Locale } from "@/lib/i18n"
import type { Messages } from "@/lib/i18n/app/types"

export interface SupportAccessMail {
  site: string
  workspace: string
  reason: string
  ticket: string | null
  minutes: number
}

interface Mail {
  /** Which mail this is, for the failure log; never the subject, which can carry a code. */
  kind: string
  to: string
  subject: string
  text: string
}

/** Records a mail that didn't go out; recordEmailFailure masks the address and the error. Never throws. */
async function failed(mail: Mail, status: number | null, error: string) {
  await recordEmailFailure(db(), { source: "web", kind: mail.kind, to: mail.to, status, error }).catch((err: unknown) =>
    console.error("[mail] couldn't record the failure:", err instanceof Error ? err.message : err),
  )
}

async function send(mail: Mail) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[mail] RESEND_API_KEY is not set; a "${mail.kind}" mail was not sent`)
      await failed(mail, null, "RESEND_API_KEY is not set")
      return
    }
    console.log(`[mail] to ${mail.to} · ${mail.subject}\n${mail.text}`)
    return
  }
  let reachError = ""
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "Apex Bot <no-reply@apexbot.eu>", to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => {
    reachError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error("[mail] couldn't reach the email provider:", reachError)
    return null
  })
  if (!res) return failed(mail, null, reachError)
  if (!res.ok) {
    console.error(`[mail] the email provider refused the message (${res.status})`)
    // Resend explains a refusal in the body ({"message": ...}); only its first bytes are kept
    const detail = (await res.text().catch(() => "")).slice(0, 300)
    await failed(mail, res.status, detail || `HTTP ${res.status}`)
  }
}

// Sent in the language the person was using when they asked for it
const EMAILS: Messages<{
  footer: string
  verification: (code: string) => { subject: string; text: string }
  passwordReset: (code: string) => { subject: string; text: string }
  handoffConfirmation: (code: string) => { subject: string; text: string }
  accountExists: { subject: string; text: string }
  emailChanged: (next: string) => { subject: string; text: string }
  invitation: (i: { workspace: string; inviter: string; link: string }) => { subject: string; text: string }
  // sent when platform staff act on the account (/admin/users/[id])
  signature: string
  staffPasswordReset: (code: string) => { subject: string; text: string }
  twoFactorReset: { subject: string; text: string }
  accountSuspended: { subject: string; text: string }
  accountReinstated: { subject: string; text: string }
  accountDeleted: { subject: string; text: string }
  // to the workspace owners when staff open support access to a site's conversations
  supportAccess: (a: SupportAccessMail) => { subject: string; text: string }
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
    emailChanged: (next) => ({
      subject: "Your Apex Bot email address was changed",
      text: `The email address of your Apex Bot account was changed to ${next}. From now on, sign in and receive our emails there.\n\nIf you didn't do this, reset your password right away from the login page and write to us by replying to this email.`,
    }),
    invitation: ({ workspace, inviter, link }) => ({
      subject: `${inviter} invited you to ${workspace} on Apex Bot`,
      text: `${inviter} invited you to join the ${workspace} workspace on Apex Bot, to work on its website assistant together.\n\nAccept the invitation here:\n${link}\n\nThe link works for 7 days. Log in or sign up with this email address to accept it.`,
    }),
    signature: "\n\nApex Bot",
    staffPasswordReset: (code) => ({
      subject: `${code} is your Apex Bot password reset code`,
      text: `Our support team sent you this code so you can choose a new password for your Apex Bot account. They can't see or set your password.\n\nYour code is ${code}\n\nOpen the login page, choose "Forgot password", and enter the code on the reset page. It expires in 15 minutes. Your current password keeps working until you change it.`,
    }),
    twoFactorReset: {
      subject: "Two-step sign-in was turned off on your Apex Bot account",
      text: "Our support team turned off two-step sign-in on your Apex Bot account, so the authenticator app and your recovery codes no longer work for it. From now on you sign in with your password alone.\n\nTurn two-step sign-in back on in Settings after you sign in.\n\nIf you didn't ask for this, reply to this email right away.",
    },
    accountSuspended: {
      subject: "Your Apex Bot account was suspended",
      text: "Your Apex Bot account was suspended and signed out on every device. While it is suspended, you can't sign in and your workspaces stay as they are.\n\nIf you think this is a mistake, reply to this email.",
    },
    accountReinstated: {
      subject: "Your Apex Bot account is active again",
      text: "The suspension on your Apex Bot account was lifted. You can sign in again as usual.",
    },
    accountDeleted: {
      subject: "Your Apex Bot account was deleted",
      text: "Your Apex Bot account was deleted by our support team, together with the workspaces only you belonged to. Workspaces you shared with others were passed to another member.\n\nIf you didn't expect this, reply to this email.",
    },
    supportAccess: ({ site, workspace, reason, ticket, minutes }) => ({
      subject: `Our support team opened temporary access to ${site}'s conversations`,
      text: `To help with ${ticket ? `support request ${ticket}` : "a support request"}, a member of our support team opened read-only access to the chatbot conversations of ${site} in your ${workspace} workspace.\n\nReason given: ${reason}\n\nThe access ends by itself after ${minutes} minutes. Your visitors' contact details stay hidden unless they are needed, and every conversation opened is recorded. Nothing can be changed or deleted through this access.\n\nIf you didn't ask us for help, reply to this email right away.`,
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
    emailChanged: (next) => ({
      subject: "Apex Bot e-posta adresiniz değiştirildi",
      text: `Apex Bot hesabınızın e-posta adresi ${next} olarak değiştirildi. Bundan sonra bu adresle giriş yapacak ve e-postalarımızı orada alacaksınız.\n\nBu değişikliği siz yapmadıysanız giriş sayfasından hemen şifrenizi sıfırlayın ve bu e-postayı yanıtlayarak bize yazın.`,
    }),
    invitation: ({ workspace, inviter, link }) => ({
      subject: `${inviter} sizi Apex Bot'ta ${workspace} çalışma alanına davet etti`,
      text: `${inviter}, web sitesi asistanı üzerinde birlikte çalışmak için sizi Apex Bot'taki ${workspace} çalışma alanına davet etti.\n\nDaveti buradan kabul edin:\n${link}\n\nBağlantı 7 gün geçerlidir. Kabul etmek için bu e-posta adresiyle giriş yapın veya kaydolun.`,
    }),
    signature: "\n\nApex Bot",
    staffPasswordReset: (code) => ({
      subject: `Apex Bot şifre sıfırlama kodunuz: ${code}`,
      text: `Apex Bot hesabınız için yeni bir şifre belirleyebilmeniz amacıyla destek ekibimiz size bu kodu gönderdi. Destek ekibi şifrenizi göremez ve belirleyemez.\n\nKodunuz: ${code}\n\nGiriş sayfasında "Şifrenizi mi unuttunuz?" bağlantısını açın ve kodu sıfırlama sayfasına girin. Kodun geçerlilik süresi 15 dakikadır. Mevcut şifreniz, değiştirene kadar çalışmaya devam eder.`,
    }),
    twoFactorReset: {
      subject: "Apex Bot hesabınızda iki adımlı giriş kapatıldı",
      text: "Destek ekibimiz Apex Bot hesabınızdaki iki adımlı girişi kapattı; doğrulama uygulamanız ve kurtarma kodlarınız artık bu hesap için çalışmıyor. Bundan sonra yalnızca şifrenizle giriş yapacaksınız.\n\nGiriş yaptıktan sonra Ayarlar'dan iki adımlı girişi yeniden açın.\n\nBunu siz istemediyseniz hemen bu e-postayı yanıtlayın.",
    },
    accountSuspended: {
      subject: "Apex Bot hesabınız askıya alındı",
      text: "Apex Bot hesabınız askıya alındı ve tüm cihazlarda oturumunuz kapatıldı. Hesap askıdayken giriş yapamazsınız; çalışma alanlarınız olduğu gibi kalır.\n\nBunun bir hata olduğunu düşünüyorsanız bu e-postayı yanıtlayın.",
    },
    accountReinstated: {
      subject: "Apex Bot hesabınız yeniden etkin",
      text: "Apex Bot hesabınızın askıya alınması kaldırıldı. Her zamanki gibi giriş yapabilirsiniz.",
    },
    accountDeleted: {
      subject: "Apex Bot hesabınız silindi",
      text: "Apex Bot hesabınız, yalnızca sizin üyesi olduğunuz çalışma alanlarıyla birlikte destek ekibimiz tarafından silindi. Başkalarıyla paylaştığınız çalışma alanları başka bir üyeye devredildi.\n\nBunu beklemiyorsanız bu e-postayı yanıtlayın.",
    },
    supportAccess: ({ site, workspace, reason, ticket, minutes }) => ({
      subject: `Destek ekibimiz ${site} konuşmalarına geçici erişim açtı`,
      text: `${ticket ? `${ticket} numaralı destek talebinize` : "Destek talebinize"} yardımcı olmak için destek ekibimizden bir kişi, ${workspace} çalışma alanınızdaki ${site} sitesinin chatbot konuşmalarına salt okunur erişim açtı.\n\nBelirtilen gerekçe: ${reason}\n\nErişim ${minutes} dakika sonra kendiliğinden kapanır. Ziyaretçilerinizin iletişim bilgileri gerekmedikçe gizli kalır ve açılan her konuşma kayda geçer. Bu erişimle hiçbir şey değiştirilemez veya silinemez.\n\nBizden yardım istemediyseniz hemen bu e-postayı yanıtlayın.`,
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
    emailChanged: (next) => ({
      subject: "Jūsų Apex Bot el. pašto adresas pakeistas",
      text: `Jūsų Apex Bot paskyros el. pašto adresas pakeistas į ${next}. Nuo šiol prisijunkite ir mūsų laiškus gaukite šiuo adresu.\n\nJei to nedarėte, nedelsdami atkurkite slaptažodį prisijungimo puslapyje ir parašykite mums atsakydami į šį laišką.`,
    }),
    invitation: ({ workspace, inviter, link }) => ({
      subject: `${inviter} pakvietė jus į ${workspace} darbo sritį Apex Bot`,
      text: `${inviter} pakvietė jus prisijungti prie ${workspace} darbo srities Apex Bot ir kartu dirbti su svetainės asistentu.\n\nPriimkite kvietimą čia:\n${link}\n\nNuoroda galioja 7 dienas. Norėdami priimti kvietimą, prisijunkite arba užsiregistruokite šiuo el. pašto adresu.`,
    }),
    signature: "\n\nApex Bot",
    staffPasswordReset: (code) => ({
      subject: `Jūsų Apex Bot slaptažodžio atkūrimo kodas: ${code}`,
      text: `Mūsų pagalbos komanda atsiuntė jums šį kodą, kad galėtumėte pasirinkti naują Apex Bot paskyros slaptažodį. Komanda jūsų slaptažodžio nemato ir negali jo nustatyti.\n\nJūsų kodas: ${code}\n\nPrisijungimo puslapyje spustelėkite „Pamiršote slaptažodį?“ ir įveskite kodą atkūrimo puslapyje. Kodas galioja 15 minučių. Dabartinis slaptažodis veikia, kol jo nepakeisite.`,
    }),
    twoFactorReset: {
      subject: "Jūsų Apex Bot paskyroje išjungtas dviejų veiksmų prisijungimas",
      text: "Mūsų pagalbos komanda išjungė dviejų veiksmų prisijungimą jūsų Apex Bot paskyroje, todėl autentifikavimo programėlė ir atkūrimo kodai šiai paskyrai nebeveikia. Nuo šiol prisijungiate tik slaptažodžiu.\n\nPrisijungę vėl įjunkite dviejų veiksmų prisijungimą nustatymuose.\n\nJei to neprašėte, nedelsdami atsakykite į šį laišką.",
    },
    accountSuspended: {
      subject: "Jūsų Apex Bot paskyra sustabdyta",
      text: "Jūsų Apex Bot paskyra sustabdyta, o visuose įrenginiuose atsijungta. Kol paskyra sustabdyta, prisijungti negalite, o jūsų darbo sritys lieka nepakeistos.\n\nJei manote, kad tai klaida, atsakykite į šį laišką.",
    },
    accountReinstated: {
      subject: "Jūsų Apex Bot paskyra vėl aktyvi",
      text: "Jūsų Apex Bot paskyros sustabdymas panaikintas. Galite vėl prisijungti kaip įprasta.",
    },
    accountDeleted: {
      subject: "Jūsų Apex Bot paskyra ištrinta",
      text: "Mūsų pagalbos komanda ištrynė jūsų Apex Bot paskyrą kartu su darbo sritimis, kurioms priklausėte tik jūs. Darbo sritys, kuriomis dalijotės su kitais, perduotos kitam nariui.\n\nJei to nesitikėjote, atsakykite į šį laišką.",
    },
    supportAccess: ({ site, workspace, reason, ticket, minutes }) => ({
      subject: `Mūsų pagalbos komanda laikinai atvėrė prieigą prie ${site} pokalbių`,
      text: `Kad padėtų išspręsti ${ticket ? `pagalbos užklausą ${ticket}` : "pagalbos užklausą"}, mūsų pagalbos komandos narys atvėrė tik skaitymo prieigą prie ${site} pokalbių roboto pokalbių jūsų ${workspace} darbo srityje.\n\nNurodyta priežastis: ${reason}\n\nPrieiga savaime baigsis po ${minutes} minučių. Jūsų lankytojų kontaktiniai duomenys lieka paslėpti, nebent jų prireiktų, o kiekvienas atvertas pokalbis užregistruojamas. Per šią prieigą nieko negalima pakeisti ar ištrinti.\n\nJei pagalbos neprašėte, nedelsdami atsakykite į šį laišką.`,
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
    emailChanged: (next) => ({
      subject: "Jūsu Apex Bot e-pasta adrese ir mainīta",
      text: `Jūsu Apex Bot konta e-pasta adrese ir nomainīta uz ${next}. Turpmāk piesakieties un saņemiet mūsu e-pastus šajā adresē.\n\nJa to neesat izdarījis jūs, nekavējoties atiestatiet paroli pieteikšanās lapā un rakstiet mums, atbildot uz šo e-pastu.`,
    }),
    invitation: ({ workspace, inviter, link }) => ({
      subject: `${inviter} uzaicināja jūs uz darbvietu ${workspace} Apex Bot`,
      text: `${inviter} uzaicināja jūs pievienoties darbvietai ${workspace} Apex Bot, lai kopā strādātu pie vietnes asistenta.\n\nPieņemiet uzaicinājumu šeit:\n${link}\n\nSaite ir derīga 7 dienas. Lai to pieņemtu, piesakieties vai reģistrējieties ar šo e-pasta adresi.`,
    }),
    signature: "\n\nApex Bot",
    staffPasswordReset: (code) => ({
      subject: `Jūsu Apex Bot paroles atiestatīšanas kods: ${code}`,
      text: `Mūsu atbalsta komanda nosūtīja jums šo kodu, lai jūs varētu izvēlēties jaunu Apex Bot konta paroli. Komanda jūsu paroli neredz un nevar to iestatīt.\n\nJūsu kods: ${code}\n\nPieteikšanās lapā izvēlieties “Aizmirsāt paroli?” un ievadiet kodu atiestatīšanas lapā. Kods ir derīgs 15 minūtes. Pašreizējā parole darbojas, līdz to nomaināt.`,
    }),
    twoFactorReset: {
      subject: "Jūsu Apex Bot kontā ir izslēgta divpakāpju pieteikšanās",
      text: "Mūsu atbalsta komanda izslēdza divpakāpju pieteikšanos jūsu Apex Bot kontā, tāpēc autentifikācijas lietotne un atkopšanas kodi šim kontam vairs nedarbojas. Turpmāk piesakāties tikai ar paroli.\n\nPēc pieteikšanās atkal ieslēdziet divpakāpju pieteikšanos iestatījumos.\n\nJa jūs to nepieprasījāt, nekavējoties atbildiet uz šo e-pastu.",
    },
    accountSuspended: {
      subject: "Jūsu Apex Bot konts ir apturēts",
      text: "Jūsu Apex Bot konts ir apturēts, un jūs esat izrakstīts visās ierīcēs. Kamēr konts ir apturēts, nevarat pieteikties, un jūsu darbvietas paliek nemainītas.\n\nJa uzskatāt, ka tā ir kļūda, atbildiet uz šo e-pastu.",
    },
    accountReinstated: {
      subject: "Jūsu Apex Bot konts atkal ir aktīvs",
      text: "Jūsu Apex Bot konta apturēšana ir atcelta. Varat atkal pieteikties kā parasti.",
    },
    accountDeleted: {
      subject: "Jūsu Apex Bot konts ir dzēsts",
      text: "Mūsu atbalsta komanda dzēsa jūsu Apex Bot kontu kopā ar darbvietām, kurās bijāt tikai jūs. Darbvietas, kuras kopīgojāt ar citiem, nodotas citam dalībniekam.\n\nJa to negaidījāt, atbildiet uz šo e-pastu.",
    },
    supportAccess: ({ site, workspace, reason, ticket, minutes }) => ({
      subject: `Mūsu atbalsta komanda atvēra pagaidu piekļuvi ${site} sarunām`,
      text: `Lai palīdzētu ar ${ticket ? `atbalsta pieprasījumu ${ticket}` : "atbalsta pieprasījumu"}, mūsu atbalsta komandas dalībnieks atvēra tikai lasīšanas piekļuvi ${site} tērzēšanas robota sarunām jūsu darbvietā ${workspace}.\n\nNorādītais iemesls: ${reason}\n\nPiekļuve beigsies pati pēc ${minutes} minūtēm. Jūsu apmeklētāju kontaktinformācija paliek paslēpta, ja vien tā nav nepieciešama, un katra atvērtā saruna tiek reģistrēta. Ar šo piekļuvi neko nevar mainīt vai dzēst.\n\nJa jūs nelūdzāt palīdzību, nekavējoties atbildiet uz šo e-pastu.`,
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
    emailChanged: (next) => ({
      subject: "Teie Apex Boti e-posti aadress on muudetud",
      text: `Teie Apex Boti konto e-posti aadress muudeti: ${next}. Edaspidi logige sisse ja saage meie e-kirju sellel aadressil.\n\nKui te seda ei teinud, lähtestage kohe sisselogimislehel oma parool ja kirjutage meile, vastates sellele e-kirjale.`,
    }),
    invitation: ({ workspace, inviter, link }) => ({
      subject: `${inviter} kutsus teid Apex Botis tööruumi ${workspace}`,
      text: `${inviter} kutsus teid liituma Apex Boti tööruumiga ${workspace}, et koos veebisaidi assistendi kallal töötada.\n\nVõtke kutse vastu siin:\n${link}\n\nLink kehtib 7 päeva. Kutse vastuvõtmiseks logige sisse või registreeruge selle e-posti aadressiga.`,
    }),
    signature: "\n\nApex Bot",
    staffPasswordReset: (code) => ({
      subject: `Teie Apex Boti parooli lähtestamise kood: ${code}`,
      text: `Meie tugimeeskond saatis teile selle koodi, et saaksite valida oma Apex Boti kontole uue parooli. Tugimeeskond ei näe ega määra teie parooli.\n\nTeie kood: ${code}\n\nAvage sisselogimislehel „Unustasite parooli?“ ja sisestage kood lähtestamise lehel. Kood kehtib 15 minutit. Praegune parool töötab seni, kuni selle muudate.`,
    }),
    twoFactorReset: {
      subject: "Teie Apex Boti kontol lülitati kaheastmeline sisselogimine välja",
      text: "Meie tugimeeskond lülitas teie Apex Boti kontol kaheastmelise sisselogimise välja, nii et autentimisrakendus ja taastekoodid selle konto jaoks enam ei tööta. Edaspidi logite sisse ainult parooliga.\n\nPärast sisselogimist lülitage kaheastmeline sisselogimine seadetes uuesti sisse.\n\nKui te seda ei palunud, vastake kohe sellele e-kirjale.",
    },
    accountSuspended: {
      subject: "Teie Apex Boti konto peatati",
      text: "Teie Apex Boti konto peatati ja teid logiti kõigis seadmetes välja. Kuni konto on peatatud, ei saa te sisse logida ning teie tööruumid jäävad muutmata.\n\nKui arvate, et see on viga, vastake sellele e-kirjale.",
    },
    accountReinstated: {
      subject: "Teie Apex Boti konto on taas aktiivne",
      text: "Teie Apex Boti konto peatamine tühistati. Saate taas tavapäraselt sisse logida.",
    },
    accountDeleted: {
      subject: "Teie Apex Boti konto kustutati",
      text: "Meie tugimeeskond kustutas teie Apex Boti konto koos tööruumidega, kuhu kuulusite ainult teie. Teistega jagatud tööruumid anti üle teisele liikmele.\n\nKui te seda ei oodanud, vastake sellele e-kirjale.",
    },
    supportAccess: ({ site, workspace, reason, ticket, minutes }) => ({
      subject: `Meie tugimeeskond avas ajutise juurdepääsu ${site} vestlustele`,
      text: `Et aidata ${ticket ? `tugipäringuga ${ticket}` : "teie tugipäringuga"}, avas meie tugimeeskonna liige ainult lugemiseks juurdepääsu teie tööruumi ${workspace} saidi ${site} vestlusroboti vestlustele.\n\nToodud põhjus: ${reason}\n\nJuurdepääs lõpeb iseenesest ${minutes} minuti pärast. Teie külastajate kontaktandmed jäävad peidetuks, kui neid pole vaja, ja iga avatud vestlus salvestatakse. Selle juurdepääsuga ei saa midagi muuta ega kustutada.\n\nKui te abi ei palunud, vastake kohe sellele e-kirjale.`,
    }),
    accountExists: {
      subject: "Teil on juba Apex Boti konto",
      text: `Keegi proovis selle e-posti aadressiga Apex Botis registreeruda, kuid sellega seotud konto on juba olemas.\n\nKui see olite teie, logige lihtsalt sisse. Kui olete parooli unustanud, kasutage sisselogimislehel linki „Unustasite parooli?“. Teie kontol ei muudetud midagi.`,
    },
  },
}

function compose(kind: string, to: string, locale: Locale, mail: { subject: string; text: string }) {
  return send({ kind, to, subject: mail.subject, text: mail.text + EMAILS[locale].footer })
}

export function sendVerificationCode(email: string, code: string, locale: Locale) {
  return compose("verification", email, locale, EMAILS[locale].verification(code))
}

export function sendPasswordResetCode(email: string, code: string, locale: Locale) {
  return compose("password_reset", email, locale, EMAILS[locale].passwordReset(code))
}

export function sendHandoffConfirmationCode(email: string, code: string, locale: Locale) {
  return compose("handoff_confirmation", email, locale, EMAILS[locale].handoffConfirmation(code))
}

export function sendAccountExistsNotice(email: string, locale: Locale) {
  return compose("account_exists", email, locale, EMAILS[locale].accountExists)
}

/** To the old address after the account email changed. */
export function sendEmailChangedNotice(previous: string, next: string, locale: Locale) {
  return send({ kind: "email_changed", to: previous, ...EMAILS[locale].emailChanged(next) })
}

export function sendInvitation(email: string, i: { workspace: string; inviter: string; link: string; locale: Locale }) {
  return compose("invitation", email, i.locale, EMAILS[i.locale].invitation(i))
}

/** A reset code staff sent from the admin area; the user picks the password, staff never see it. */
export function sendStaffPasswordReset(email: string, code: string, locale: Locale) {
  return send({ kind: "staff_password_reset", to: email, ...withSignature(EMAILS[locale].staffPasswordReset(code), locale) })
}

export type StaffNotice = "twoFactorReset" | "accountSuspended" | "accountReinstated" | "accountDeleted"

/** Tells the user what platform staff did to their account. */
export function sendStaffNotice(email: string, notice: StaffNotice, locale: Locale) {
  return send({ kind: "staff_notice", to: email, ...withSignature(EMAILS[locale][notice], locale) })
}

const withSignature = (mail: { subject: string; text: string }, locale: Locale) => ({ subject: mail.subject, text: mail.text + EMAILS[locale].signature })

/** Tells a workspace owner that staff opened support access to one of their sites' conversations. */
export function sendSupportAccessNotice(email: string, access: SupportAccessMail, locale: Locale) {
  return send({ kind: "support_access", to: email, ...withSignature(EMAILS[locale].supportAccess(access), locale) })
}

// --- Support tickets (/dashboard/support, /admin/support) ---

export interface TicketMail {
  /** "#1042" */
  ref: string
  subject: string
  link: string
}

export interface TicketMessageMail extends TicketMail {
  body: string
}

export interface TicketStaffMail extends TicketMessageMail {
  /** The customer's email address. */
  from: string
  workspace: string
  site: string | null
}

// Quoted message bodies are capped: the full thread is one click away
const quote = (body: string) => {
  const cut = body.length > 2000 ? `${body.slice(0, 2000)}…` : body
  return cut
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

const SUPPORT_EMAILS: Messages<{
  // to the customer
  received: (t: TicketMail) => { subject: string; text: string }
  reply: (t: TicketMessageMail) => { subject: string; text: string }
  // to staff
  staffNew: (t: TicketStaffMail) => { subject: string; text: string }
  staffReply: (t: TicketStaffMail) => { subject: string; text: string }
  staffAssigned: (t: TicketMail) => { subject: string; text: string }
}> = {
  en: {
    received: ({ ref, subject, link }) => ({
      subject: `[${ref}] We got your request: ${subject}`,
      text: `Thanks for writing to us. Your request ${ref} is with our support team, and we'll answer as soon as we can.\n\nFollow it and add details here:\n${link}`,
    }),
    reply: ({ ref, subject, body, link }) => ({
      subject: `[${ref}] New reply: ${subject}`,
      text: `Our support team answered your request ${ref}:\n\n${quote(body)}\n\nRead the whole conversation and reply here:\n${link}\n\nReplies to this email aren't read; answer in the dashboard instead.`,
    }),
    staffNew: ({ ref, subject, body, link, from, workspace, site }) => ({
      subject: `[${ref}] New ticket: ${subject}`,
      text: `${from} (${workspace}${site ? ` · ${site}` : ""}) opened a ticket:\n\n${quote(body)}\n\n${link}`,
    }),
    staffReply: ({ ref, subject, body, link, from }) => ({
      subject: `[${ref}] Customer replied: ${subject}`,
      text: `${from} wrote on ${ref}:\n\n${quote(body)}\n\n${link}`,
    }),
    staffAssigned: ({ ref, subject, link }) => ({
      subject: `[${ref}] Assigned to you: ${subject}`,
      text: `Ticket ${ref} was assigned to you.\n\n${link}`,
    }),
  },
  tr: {
    received: ({ ref, subject, link }) => ({
      subject: `[${ref}] Talebinizi aldık: ${subject}`,
      text: `Bize yazdığınız için teşekkürler. ${ref} numaralı talebiniz destek ekibimize ulaştı; en kısa sürede yanıtlayacağız.\n\nTalebinizi buradan takip edebilir ve ayrıntı ekleyebilirsiniz:\n${link}`,
    }),
    reply: ({ ref, subject, body, link }) => ({
      subject: `[${ref}] Yeni yanıt: ${subject}`,
      text: `Destek ekibimiz ${ref} numaralı talebinizi yanıtladı:\n\n${quote(body)}\n\nYazışmanın tamamını okumak ve yanıtlamak için:\n${link}\n\nBu e-postaya verilen yanıtlar okunmaz; lütfen panel üzerinden yanıtlayın.`,
    }),
    staffNew: ({ ref, subject, body, link, from, workspace, site }) => ({
      subject: `[${ref}] Yeni talep: ${subject}`,
      text: `${from} (${workspace}${site ? ` · ${site}` : ""}) bir talep açtı:\n\n${quote(body)}\n\n${link}`,
    }),
    staffReply: ({ ref, subject, body, link, from }) => ({
      subject: `[${ref}] Müşteri yanıtladı: ${subject}`,
      text: `${from}, ${ref} numaralı talebe yazdı:\n\n${quote(body)}\n\n${link}`,
    }),
    staffAssigned: ({ ref, subject, link }) => ({
      subject: `[${ref}] Size atandı: ${subject}`,
      text: `${ref} numaralı talep size atandı.\n\n${link}`,
    }),
  },
  lt: {
    received: ({ ref, subject, link }) => ({
      subject: `[${ref}] Gavome jūsų užklausą: ${subject}`,
      text: `Ačiū, kad parašėte. Jūsų užklausa ${ref} perduota mūsų pagalbos komandai, atsakysime kuo greičiau.\n\nSekite ją ir papildykite informaciją čia:\n${link}`,
    }),
    reply: ({ ref, subject, body, link }) => ({
      subject: `[${ref}] Naujas atsakymas: ${subject}`,
      text: `Mūsų pagalbos komanda atsakė į jūsų užklausą ${ref}:\n\n${quote(body)}\n\nVisą pokalbį perskaityti ir atsakyti galite čia:\n${link}\n\nAtsakymai į šį el. laišką neskaitomi; atsakykite valdymo skydelyje.`,
    }),
    staffNew: ({ ref, subject, body, link, from, workspace, site }) => ({
      subject: `[${ref}] Nauja užklausa: ${subject}`,
      text: `${from} (${workspace}${site ? ` · ${site}` : ""}) pateikė užklausą:\n\n${quote(body)}\n\n${link}`,
    }),
    staffReply: ({ ref, subject, body, link, from }) => ({
      subject: `[${ref}] Klientas atsakė: ${subject}`,
      text: `${from} parašė užklausoje ${ref}:\n\n${quote(body)}\n\n${link}`,
    }),
    staffAssigned: ({ ref, subject, link }) => ({
      subject: `[${ref}] Priskirta jums: ${subject}`,
      text: `Užklausa ${ref} priskirta jums.\n\n${link}`,
    }),
  },
  lv: {
    received: ({ ref, subject, link }) => ({
      subject: `[${ref}] Mēs saņēmām jūsu pieteikumu: ${subject}`,
      text: `Paldies, ka mums rakstījāt. Jūsu pieteikums ${ref} ir nodots mūsu atbalsta komandai, un mēs atbildēsim pēc iespējas ātrāk.\n\nSekojiet tam un papildiniet informāciju šeit:\n${link}`,
    }),
    reply: ({ ref, subject, body, link }) => ({
      subject: `[${ref}] Jauna atbilde: ${subject}`,
      text: `Mūsu atbalsta komanda atbildēja uz jūsu pieteikumu ${ref}:\n\n${quote(body)}\n\nIzlasiet visu saraksti un atbildiet šeit:\n${link}\n\nAtbildes uz šo e-pastu netiek lasītas; lūdzu, atbildiet vadības panelī.`,
    }),
    staffNew: ({ ref, subject, body, link, from, workspace, site }) => ({
      subject: `[${ref}] Jauns pieteikums: ${subject}`,
      text: `${from} (${workspace}${site ? ` · ${site}` : ""}) izveidoja pieteikumu:\n\n${quote(body)}\n\n${link}`,
    }),
    staffReply: ({ ref, subject, body, link, from }) => ({
      subject: `[${ref}] Klients atbildēja: ${subject}`,
      text: `${from} rakstīja pieteikumā ${ref}:\n\n${quote(body)}\n\n${link}`,
    }),
    staffAssigned: ({ ref, subject, link }) => ({
      subject: `[${ref}] Piešķirts jums: ${subject}`,
      text: `Pieteikums ${ref} ir piešķirts jums.\n\n${link}`,
    }),
  },
  et: {
    received: ({ ref, subject, link }) => ({
      subject: `[${ref}] Saime teie pöördumise kätte: ${subject}`,
      text: `Täname, et meile kirjutasite. Teie pöördumine ${ref} on meie tugimeeskonna käes ja vastame niipea kui võimalik.\n\nSaate seda jälgida ja täiendada siin:\n${link}`,
    }),
    reply: ({ ref, subject, body, link }) => ({
      subject: `[${ref}] Uus vastus: ${subject}`,
      text: `Meie tugimeeskond vastas teie pöördumisele ${ref}:\n\n${quote(body)}\n\nKogu vestluse lugemiseks ja vastamiseks avage:\n${link}\n\nSellele e-kirjale saadetud vastuseid ei loeta; vastake palun juhtpaneelil.`,
    }),
    staffNew: ({ ref, subject, body, link, from, workspace, site }) => ({
      subject: `[${ref}] Uus pöördumine: ${subject}`,
      text: `${from} (${workspace}${site ? ` · ${site}` : ""}) avas pöördumise:\n\n${quote(body)}\n\n${link}`,
    }),
    staffReply: ({ ref, subject, body, link, from }) => ({
      subject: `[${ref}] Klient vastas: ${subject}`,
      text: `${from} kirjutas pöördumisse ${ref}:\n\n${quote(body)}\n\n${link}`,
    }),
    staffAssigned: ({ ref, subject, link }) => ({
      subject: `[${ref}] Teile määratud: ${subject}`,
      text: `Pöördumine ${ref} määrati teile.\n\n${link}`,
    }),
  },
}

/** To the customer: their ticket arrived. */
export function sendTicketReceived(email: string, t: TicketMail, locale: Locale) {
  return send({ kind: "ticket_received", to: email, ...withSignature(SUPPORT_EMAILS[locale].received(t), locale) })
}

/** To the customer: staff answered (never for internal notes). */
export function sendTicketReply(email: string, t: TicketMessageMail, locale: Locale) {
  return send({ kind: "ticket_reply", to: email, ...withSignature(SUPPORT_EMAILS[locale].reply(t), locale) })
}

export type StaffTicketNotice = "staffNew" | "staffReply"

/** To staff: a new ticket, or the customer wrote on one. */
export function sendTicketStaffNotice(email: string, notice: StaffTicketNotice, t: TicketStaffMail, locale: Locale) {
  return send({ kind: "ticket_staff", to: email, ...SUPPORT_EMAILS[locale][notice](t) })
}

/** To a staff member another one gave a ticket to. */
export function sendTicketAssigned(email: string, t: TicketMail, locale: Locale) {
  return send({ kind: "ticket_assigned", to: email, ...SUPPORT_EMAILS[locale].staffAssigned(t) })
}

// To people staff invited from the waitlist (/admin/waitlist), in the language they joined in
const WAITLIST_EMAILS: Messages<(i: { email: string; link: string }) => { subject: string; text: string }> = {
  en: ({ email, link }) => ({
    subject: "Your invitation to Apex Bot",
    text: `You joined the Apex Bot waitlist, and your place is ready.\n\nCreate your account here:\n${link}\n\nThe invitation is for ${email}: sign up with this address, or with Google or GitHub on the same email.`,
  }),
  tr: ({ email, link }) => ({
    subject: "Apex Bot davetiniz",
    text: `Apex Bot bekleme listesine katılmıştınız; yeriniz hazır.\n\nHesabınızı buradan oluşturun:\n${link}\n\nDavet ${email} adresi içindir: bu adresle ya da aynı e-postayla Google veya GitHub üzerinden kaydolun.`,
  }),
  lt: ({ email, link }) => ({
    subject: "Jūsų kvietimas į Apex Bot",
    text: `Prisijungėte prie Apex Bot laukiančiųjų sąrašo, ir jūsų vieta jau paruošta.\n\nSusikurkite paskyrą čia:\n${link}\n\nKvietimas skirtas ${email}: registruokitės šiuo adresu arba per Google ar GitHub su tuo pačiu el. paštu.`,
  }),
  lv: ({ email, link }) => ({
    subject: "Jūsu ielūgums uz Apex Bot",
    text: `Jūs pievienojāties Apex Bot gaidīšanas sarakstam, un jūsu vieta ir gatava.\n\nIzveidojiet kontu šeit:\n${link}\n\nIelūgums ir adresei ${email}: reģistrējieties ar šo adresi vai ar Google vai GitHub, izmantojot to pašu e-pastu.`,
  }),
  et: ({ email, link }) => ({
    subject: "Teie kutse Apex Botti",
    text: `Liitusite Apex Boti ootenimekirjaga ja teie koht on valmis.\n\nLooge konto siin:\n${link}\n\nKutse on aadressile ${email}: registreeruge selle aadressiga või Google'i või GitHubi kaudu sama e-postiga.`,
  }),
}

export function sendWaitlistInvite(email: string, link: string, locale: Locale) {
  return compose("waitlist_invite", email, locale, WAITLIST_EMAILS[locale]({ email, link }))
}
