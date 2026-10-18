import type { Locale } from "@/lib/i18n/config"

// Canned replies for /admin/support. Each is written in every language, and the ticket page offers
// them in the language the customer wrote in. {name} becomes the customer's name. Staff edit the
// text before sending; nothing goes out unread.

export const TEMPLATE_KEYS = ["needDetails", "investigating", "widgetInstall", "knowledgeSync", "billing", "fixed"] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

const TEMPLATES: Record<Locale, Record<TemplateKey, string>> = {
  en: {
    needDetails:
      "Hi {name},\n\nThanks for getting in touch. To look into this, could you send us:\n- the address of the page where it happens\n- what you clicked or typed just before\n- a screenshot, if you can\n\nThen we'll take it from there.",
    investigating: "Hi {name},\n\nThanks, we can see the problem on our side and are working on a fix. We'll update you here as soon as it's sorted.",
    widgetInstall:
      "Hi {name},\n\nThe chat widget only loads on the addresses listed under Widget → Install & security → Allowed websites. Please check that your site's exact address is there (with https://, and with www if your site uses it), then reload the page.",
    knowledgeSync:
      "Hi {name},\n\nAfter you change your website, open Knowledge and press Sync on that source so the assistant reads the new content. Larger sites can take a few minutes.",
    billing: "Hi {name},\n\nThanks for your message about billing. We've passed it to the team that handles plans and invoices, and we'll get back to you within one working day.",
    fixed: "Hi {name},\n\nThis should be fixed now. Could you check on your side? If everything works, you can mark the request as resolved; if not, just reply here.",
  },
  tr: {
    needDetails:
      "Merhaba {name},\n\nBize yazdığınız için teşekkürler. Bunu inceleyebilmemiz için şunları gönderebilir misiniz:\n- sorunun yaşandığı sayfanın adresi\n- hemen öncesinde neye tıkladığınız ya da ne yazdığınız\n- mümkünse bir ekran görüntüsü\n\nSonrasını biz devralırız.",
    investigating: "Merhaba {name},\n\nTeşekkürler, sorunu kendi tarafımızda görebiliyoruz ve bir düzeltme üzerinde çalışıyoruz. Çözüldüğü anda sizi buradan bilgilendireceğiz.",
    widgetInstall:
      "Merhaba {name},\n\nSohbet widget'ı yalnızca Widget → Kurulum ve güvenlik → İzin verilen web siteleri altında listelenen adreslerde yüklenir. Sitenizin tam adresinin orada olduğunu (https:// ile, siteniz kullanıyorsa www ile) kontrol edip sayfayı yenileyin.",
    knowledgeSync:
      "Merhaba {name},\n\nWeb sitenizi değiştirdikten sonra Bilgi tabanı sayfasını açıp ilgili kaynakta Senkronize et'e basın; böylece asistan yeni içeriği okur. Büyük sitelerde bu birkaç dakika sürebilir.",
    billing: "Merhaba {name},\n\nFaturalandırmayla ilgili mesajınız için teşekkürler. Plan ve faturalarla ilgilenen ekibimize ilettik; bir iş günü içinde size döneceğiz.",
    fixed: "Merhaba {name},\n\nSorun artık çözülmüş olmalı. Kendi tarafınızda kontrol edebilir misiniz? Her şey çalışıyorsa talebi çözüldü olarak işaretleyebilirsiniz; çalışmıyorsa buradan yanıtlamanız yeterli.",
  },
  lt: {
    needDetails:
      "Sveiki, {name},\n\nAčiū, kad susisiekėte. Kad galėtume tai ištirti, atsiųskite mums:\n- puslapio, kuriame tai nutinka, adresą\n- ką paspaudėte ar įvedėte prieš pat tai\n- jei galite, ekrano kopiją\n\nToliau pasirūpinsime mes.",
    investigating: "Sveiki, {name},\n\nAčiū, problemą matome ir mes, ją taisome. Kai tik ji bus išspręsta, pranešime čia.",
    widgetInstall:
      "Sveiki, {name},\n\nPokalbių valdiklis įkeliamas tik adresuose, nurodytuose skiltyje Valdiklis → Diegimas ir sauga → Leidžiamos svetainės. Patikrinkite, ar ten yra tikslus jūsų svetainės adresas (su https://, o jei svetainė naudoja www, ir su www), tada perkraukite puslapį.",
    knowledgeSync:
      "Sveiki, {name},\n\nPakeitę svetainę, atidarykite Žinių bazę ir prie to šaltinio paspauskite Sinchronizuoti, kad asistentas perskaitytų naują turinį. Didesnėms svetainėms tai gali užtrukti kelias minutes.",
    billing: "Sveiki, {name},\n\nAčiū už žinutę dėl mokėjimų. Perdavėme ją komandai, kuri rūpinasi planais ir sąskaitomis, ir atsakysime per vieną darbo dieną.",
    fixed: "Sveiki, {name},\n\nDabar tai turėtų būti sutvarkyta. Ar galėtumėte patikrinti? Jei viskas veikia, užklausą galite pažymėti kaip išspręstą; jei ne, tiesiog atsakykite čia.",
  },
  lv: {
    needDetails:
      "Labdien, {name}!\n\nPaldies, ka sazinājāties. Lai to izpētītu, lūdzu, atsūtiet mums:\n- tās lapas adresi, kurā tas notiek\n- ko tieši pirms tam noklikšķinājāt vai ierakstījāt\n- ja iespējams, ekrānuzņēmumu\n\nTālāk parūpēsimies mēs.",
    investigating: "Labdien, {name}!\n\nPaldies, mēs redzam problēmu arī savā pusē un strādājam pie labojuma. Tiklīdz tā būs atrisināta, informēsim jūs šeit.",
    widgetInstall:
      "Labdien, {name}!\n\nTērzēšanas logrīks ielādējas tikai adresēs, kas norādītas sadaļā Logrīks → Uzstādīšana un drošība → Atļautās vietnes. Lūdzu, pārbaudiet, vai tur ir jūsu vietnes precīzā adrese (ar https:// un ar www, ja vietne to izmanto), un pārlādējiet lapu.",
    knowledgeSync:
      "Labdien, {name}!\n\nPēc vietnes izmaiņām atveriet Zināšanu bāzi un pie attiecīgā avota nospiediet Sinhronizēt, lai asistents nolasītu jauno saturu. Lielākām vietnēm tas var aizņemt dažas minūtes.",
    billing: "Labdien, {name}!\n\nPaldies par ziņu saistībā ar rēķiniem. Mēs to nodevām komandai, kas atbild par plāniem un rēķiniem, un atbildēsim vienas darba dienas laikā.",
    fixed: "Labdien, {name}!\n\nTagad tam vajadzētu būt salabotam. Vai varat to pārbaudīt? Ja viss darbojas, varat atzīmēt pieteikumu kā atrisinātu; ja nē, vienkārši atbildiet šeit.",
  },
  et: {
    needDetails:
      "Tere, {name}!\n\nTäname, et ühendust võtsite. Et seda uurida, palun saatke meile:\n- selle lehe aadress, kus see juhtub\n- millele te vahetult enne klõpsasite või mida sisestasite\n- võimalusel ekraanipilt\n\nEdasi tegeleme sellega meie.",
    investigating: "Tere, {name}!\n\nTäname, näeme probleemi ka enda poolel ja töötame paranduse kallal. Anname teile siin teada kohe, kui see on lahendatud.",
    widgetInstall:
      "Tere, {name}!\n\nVestlusvidin laaditakse ainult aadressidel, mis on loetletud jaotises Vidin → Paigaldus ja turvalisus → Lubatud veebisaidid. Palun kontrollige, et teie saidi täpne aadress oleks seal (koos https:// ja www-ga, kui sait seda kasutab), ning laadige leht uuesti.",
    knowledgeSync:
      "Tere, {name}!\n\nPärast veebisaidi muutmist avage Teadmusbaas ja vajutage selle allika juures Sünkrooni, et assistent loeks uue sisu. Suuremate saitide puhul võib see võtta mõne minuti.",
    billing: "Tere, {name}!\n\nTäname arveldusega seotud sõnumi eest. Edastasime selle meeskonnale, kes tegeleb pakettide ja arvetega, ning vastame ühe tööpäeva jooksul.",
    fixed: "Tere, {name}!\n\nNüüd peaks see olema parandatud. Kas saaksite oma poolel kontrollida? Kui kõik töötab, võite pöördumise lahendatuks märkida; kui mitte, vastake lihtsalt siin.",
  },
}

/** A template in the customer's language, with their name filled in. */
export function templateText(key: TemplateKey, locale: Locale, name: string): string {
  const text = TEMPLATES[locale][key]
  // without a name the greeting stands alone: "Hi," / "Merhaba,"
  return name.trim() ? text.replaceAll("{name}", name.trim()) : text.replace(/,? ?\{name\}/g, "")
}
