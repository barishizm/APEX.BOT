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
  emailChanged: (next: string) => { subject: string; text: string }
  invitation: (i: { workspace: string; inviter: string; link: string }) => { subject: string; text: string }
  // sent when platform staff act on the account (/admin/users/[id])
  signature: string
  staffPasswordReset: (code: string) => { subject: string; text: string }
  twoFactorReset: { subject: string; text: string }
  accountSuspended: { subject: string; text: string }
  accountReinstated: { subject: string; text: string }
  accountDeleted: { subject: string; text: string }
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

/** To the old address after the account email changed. */
export function sendEmailChangedNotice(previous: string, next: string, locale: Locale) {
  return send({ to: previous, ...EMAILS[locale].emailChanged(next) })
}

export function sendInvitation(email: string, i: { workspace: string; inviter: string; link: string; locale: Locale }) {
  return compose(email, i.locale, EMAILS[i.locale].invitation(i))
}

/** A reset code staff sent from the admin area; the user picks the password, staff never see it. */
export function sendStaffPasswordReset(email: string, code: string, locale: Locale) {
  return send({ to: email, ...withSignature(EMAILS[locale].staffPasswordReset(code), locale) })
}

export type StaffNotice = "twoFactorReset" | "accountSuspended" | "accountReinstated" | "accountDeleted"

/** Tells the user what platform staff did to their account. */
export function sendStaffNotice(email: string, notice: StaffNotice, locale: Locale) {
  return send({ to: email, ...withSignature(EMAILS[locale][notice], locale) })
}

const withSignature = (mail: { subject: string; text: string }, locale: Locale) => ({ subject: mail.subject, text: mail.text + EMAILS[locale].signature })
