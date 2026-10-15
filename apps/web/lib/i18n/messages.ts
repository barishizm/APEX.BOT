import type { Locale } from "./config"

// Error and validation messages come from the shared packages (@apex/db, @apex/knowledge) in
// English, the language the code and logs use. They are translated at the edge: API responses
// (lib/auth, lib/bot, lib/knowledge) and the widget studio's local checks run them through here.
// A message without a rule is shown as is, so a new English message degrades gracefully.

type Rule = readonly [match: string | RegExp, replacement: string]

// English is the source language, so it needs no rules
const RULES: Record<Locale, Rule[]> = {
  en: [],
  tr: [
    // generic
    ["Something went wrong. Try again", "Bir şeyler ters gitti. Tekrar deneyin"],
    ["Expected a JSON body", "İstek gövdesi JSON olmalı"],
    ["Expected a JSON object", "İstek gövdesi bir JSON nesnesi olmalı"],
    ["Not logged in", "Giriş yapmadınız"],
    ["Log in again", "Tekrar giriş yapın"],
    ["Your session has ended. Log in again", "Oturumunuz sona erdi. Tekrar giriş yapın"],
    ["Verify your email first", "Önce e-postanızı doğrulayın"],
    ["The database needs an update. Run npm run db:migrate", "Veritabanının güncellenmesi gerekiyor. npm run db:migrate komutunu çalıştırın"],
    ["Nothing to update", "Güncellenecek bir şey yok"],

    // account and sign-in
    ["Enter a valid email address", "Geçerli bir e-posta adresi girin"],
    ["Password must be at least 8 characters", "Şifre en az 8 karakter olmalı"],
    ["Password is too long", "Şifre çok uzun"],
    ["An account with this email already exists", "Bu e-posta adresiyle bir hesap zaten var"],
    ["This username is taken", "Bu kullanıcı adı alınmış"],
    ["Username must be 3-32 letters, numbers, dots, dashes or underscores", "Kullanıcı adı 3-32 karakter olmalı; harf, rakam, nokta, tire veya alt çizgi kullanabilirsiniz"],
    ["Choose an account type", "Bir hesap türü seçin"],
    ["You must accept the Terms of Service", "Kullanım Koşulları'nı kabul etmelisiniz"],
    ["Choose a company size", "Şirket büyüklüğünü seçin"],
    ["Too many failed attempts. Try again in 15 minutes", "Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin"],
    ["Incorrect email or password", "E-posta veya şifre hatalı"],
    ["This email is already verified", "Bu e-posta zaten doğrulanmış"],
    ["Enter the 6-digit code we sent you", "Size gönderdiğimiz 6 haneli kodu girin"],
    ["This code is no longer valid. Request a new one", "Bu kod artık geçerli değil. Yeni bir kod isteyin"],
    ["This code has expired. Request a new one", "Bu kodun süresi doldu. Yeni bir kod isteyin"],
    ["Too many incorrect codes. Request a new one", "Çok fazla hatalı kod girildi. Yeni bir kod isteyin"],
    ["Too many incorrect codes. Try again later", "Çok fazla hatalı kod girildi. Daha sonra tekrar deneyin"],
    ["Too many requests. Try again later", "Çok fazla istek. Daha sonra tekrar deneyin"],
    ["Incorrect code. Check your email and try again", "Kod hatalı. E-postanızı kontrol edip tekrar deneyin"],
    ["Incorrect code. Check the inbox of that address and try again", "Kod hatalı. O adresin gelen kutusunu kontrol edip tekrar deneyin"],
    [/^Wait (\d+)s before requesting another code$/, "Yeni bir kod istemeden önce $1 sn bekleyin"],
    ["Too many codes requested today. Try again tomorrow", "Bugün çok fazla kod istendi. Yarın tekrar deneyin"],
    ["Your provider has no verified email for this account. Verify it there and try again", "Sağlayıcınızda bu hesap için doğrulanmış bir e-posta yok. Orada doğrulayıp tekrar deneyin"],
    ["Couldn't pick a username. Try signing up with email instead", "Kullanıcı adı oluşturulamadı. Bunun yerine e-postayla kaydolmayı deneyin"],
    ["Choose yes or no", "Evet veya hayır seçin"],
    ["Your current password is incorrect", "Mevcut şifreniz hatalı"],
    ["Choose a password different from your current one", "Mevcut şifrenizden farklı bir şifre seçin"],
    ["Type your email address exactly to confirm", "Onaylamak için e-posta adresinizi aynen yazın"],

    // bot and workspace
    ["You are not a member of any workspace", "Herhangi bir çalışma alanının üyesi değilsiniz"],
    ["Only workspace owners and admins can change the bot", "Botu yalnızca çalışma alanı sahipleri ve yöneticileri değiştirebilir"],
    ["These settings were changed somewhere else. Reload to see the latest version", "Bu ayarlar başka bir yerde değiştirildi. En güncel hali görmek için sayfayı yenileyin"],
    ["Some settings need fixing", "Bazı ayarların düzeltilmesi gerekiyor"],
    ["Confirm this address with the code we email you before using it", "Kullanmadan önce bu adresi e-postayla gönderdiğimiz kodla onaylayın"],

    // knowledge
    ["Only workspace owners and admins can change the knowledge base", "Bilgi tabanını yalnızca çalışma alanı sahipleri ve yöneticileri değiştirebilir"],
    ["Give it a title", "Bir başlık verin"],
    [/^Keep the title under (\d+) characters$/, "Başlık $1 karakterden kısa olmalı"],
    [/^You can have up to (\d+) sources\. Remove one to add another$/, "En fazla $1 kaynak ekleyebilirsiniz. Yenisini eklemek için birini kaldırın"],
    ["Enter a valid website address", "Geçerli bir web sitesi adresi girin"],
    ["Add at least a sentence or two of text", "En az bir iki cümlelik metin ekleyin"],
    [/^Keep each text under ([\d.,]+) characters, or split it in two$/, "Her metin $1 karakterden kısa olmalı ya da ikiye bölün"],
    ["Your knowledge base is full. Remove a source to add more", "Bilgi tabanınız dolu. Daha fazlasını eklemek için bir kaynağı kaldırın"],
    ["Your knowledge base is full, so only part of this website was kept", "Bilgi tabanınız dolu olduğu için bu web sitesinin yalnızca bir kısmı saklandı"],
    ["That source doesn't exist", "Böyle bir kaynak yok"],
    ["Other websites are still being read. Try again when they're done", "Diğer web siteleri hâlâ okunuyor. Bitince tekrar deneyin"],
    ["This website is already being read", "Bu web sitesi zaten okunuyor"],
    ["Choose a website or a text", "Bir web sitesi veya metin seçin"],
    ["Type a question", "Bir soru yazın"],
    ["This conversation doesn't exist or was deleted", "Bu konuşma yok ya da silinmiş"],

    // reading a website (@apex/knowledge)
    ["Something went wrong while reading the site. Try again", "Site okunurken bir şeyler ters gitti. Tekrar deneyin"],
    ["The sync was interrupted. Try again", "Senkronizasyon yarıda kesildi. Tekrar deneyin"],
    ["Enter your website address", "Web sitenizin adresini girin"],
    ["That doesn't look like a website address", "Bu bir web sitesi adresine benzemiyor"],
    ["This address can't be read", "Bu adres okunamıyor"],
    ["Couldn't open the website", "Web sitesi açılamadı"],
    ["The site's robots.txt doesn't allow reading this page", "Sitenin robots.txt dosyası bu sayfanın okunmasına izin vermiyor"],
    ["No readable text was found on this website", "Bu web sitesinde okunabilir metin bulunamadı"],
    ["Not a valid URL", "Geçerli bir URL değil"],
    ["Only http and https URLs can be read", "Yalnızca http ve https adresleri okunabilir"],
    ["URLs with credentials can't be read", "Kullanıcı adı/şifre içeren adresler okunamaz"],
    ["Only standard ports (80, 443) can be read", "Yalnızca standart portlar (80, 443) okunabilir"],
    ["Private network addresses can't be read", "Özel ağ adresleri okunamaz"],
    ["Local hostnames can't be read", "Yerel ana makine adları okunamaz"],
    ["The page is too large", "Sayfa çok büyük"],
    ["This address points to a private network", "Bu adres özel bir ağı gösteriyor"],
    ["The site took too long to respond", "Site çok geç yanıt verdi"],
    ["The domain doesn't exist", "Böyle bir alan adı yok"],
    ["Couldn't connect to the site", "Siteye bağlanılamadı"],
    [/^Redirect without a location \((\d+)\)$/, "Hedefi olmayan yönlendirme ($1)"],
    [/^The site answered with HTTP (\d+)$/, "Site HTTP $1 ile yanıt verdi"],
    [/^Not a web page \((.+)\)$/, "Bir web sayfası değil ($1)"],
    ["Too many redirects", "Çok fazla yönlendirme"],

    // widget settings checks (@apex/db bot-settings)
    ["Settings must be an object", "Ayarlar bir nesne olmalı"],
    ["Must be an object", "Bir nesne olmalı"],
    ["Must be text", "Metin olmalı"],
    ["Required", "Zorunlu"],
    [/^Keep it under (\d+) characters$/, "$1 karakterden kısa olmalı"],
    ["Must be on or off", "Açık veya kapalı olmalı"],
    ["Must be a number", "Bir sayı olmalı"],
    ["Must be a whole number", "Tam sayı olmalı"],
    [/^Must be between (.+) and (.+)$/, "$1 ile $2 arasında olmalı"],
    [/^Must be one of: (.+)$/, "Şunlardan biri olmalı: $1"],
    ["Must have a Turkish and an English version", "Türkçe ve İngilizce sürümü olmalı"],
    ["Must be a list", "Bir liste olmalı"],
    [/^At most (\d+) items$/, "En fazla $1 öğe"],
    ["Use a hex color like #1f6feb", "#1f6feb gibi bir hex renk kodu kullanın"],
    ["Use an https:// image URL", "https:// ile başlayan bir görsel adresi kullanın"],
    ["Upload a PNG, JPEG, WebP or GIF, or use an https:// image URL", "PNG, JPEG, WebP veya GIF yükleyin ya da https:// ile başlayan bir görsel adresi kullanın"],
    ["Use a full URL starting with https://", "https:// ile başlayan tam bir adres kullanın"],
    ["Upload an image or pick one of the icons", "Bir görsel yükleyin veya simgelerden birini seçin"],
    ["Add an image URL or pick another avatar style", "Bir görsel adresi ekleyin veya başka bir avatar stili seçin"],
    ["Must have a Turkish and an English list", "Türkçe ve İngilizce bir liste olmalı"],
    ["Pick a model from the list", "Listeden bir model seçin"],
    [/^This provider accepts at most (.+)$/, "Bu sağlayıcı en fazla $1 kabul eder"],
    ["Pick a fallback model from the list", "Listeden bir yedek model seçin"],
    ["Pick a different model than the primary one", "Ana modelden farklı bir model seçin"],
    ["Add the address that receives hand-offs, or turn hand-off off", "Devir taleplerini alacak adresi ekleyin ya da insana devri kapatın"],

    // launcher image upload (widget studio, in the browser)
    ["Use a PNG, JPEG, WebP or GIF image", "PNG, JPEG, WebP veya GIF görseli kullanın"],
    ["Couldn't read the file", "Dosya okunamadı"],
    ["This GIF is too large. Keep it under 85 KB", "Bu GIF çok büyük. 85 KB'tan küçük tutun"],
    ["Couldn't read the image", "Görsel okunamadı"],
    ["This image is too detailed. Try a simpler one", "Bu görsel çok ayrıntılı. Daha sade bir görsel deneyin"],
  ],
}

export function translateMessage(message: string, locale: Locale): string {
  for (const [match, replacement] of RULES[locale]) {
    if (typeof match === "string" ? message === match : match.test(message)) {
      return typeof match === "string" ? replacement : message.replace(match, replacement)
    }
  }
  return message
}

// For `{ path, message }` lists such as the settings checks
export const translateIssues = <T extends { message: string }>(issues: T[], locale: Locale): T[] =>
  issues.map((issue) => ({ ...issue, message: translateMessage(issue.message, locale) }))
