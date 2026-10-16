import { CONTACT_EMAIL } from "@/components/site-nav";
import type { MarketingContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="what">Apex Bot nedir?</h2>
      <p>
        Apex Bot, web siteleri için bir yapay zekâ destek asistanıdır. Sayfalarınızı okur, bunlardan size özel bir bilgi
        tabanı oluşturur ve ziyaretçilerinizin sorularını sohbet widget'ında Türkçe, İngilizce, Litvanca, Letonca ve Estonca olarak, günün her saati
        yanıtlar. Yalnızca sizin verdiğiniz bilgilerle yanıt verir, her yanıtın geldiği sayfayı gösterir ve bilmediğinde
        bunu açıkça söyler.
      </p>
      <p>
        Apex şu anda kapalı beta aşamasında. Beta süresince tüm özellikler ücretsiz; yeni kayıtlar{" "}
        <a href="/tr/signup">bekleme listesi</a> üzerinden dalgalar halinde açılıyor.
      </p>

      <h2 id="why">Neden geliştirdik?</h2>
      <p>
        Bir işletmeye internetten gelen soruların çoğunun yanıtı zaten kendi web sitesinde bir yerde yazılıdır: kargo
        süreleri, iade kuralları, çalışma saatleri, bir planın neleri kapsadığı. Ziyaretçiler yine de sorar, çoğu zaman mesai
        saatleri dışında, ve yanıt alamayınca siteden ayrılır. Genel amaçlı chatbotlar bu boşluğu iyi dolduramaz: tahmin
        yürütür, politika uydurur ve işletmenin hiç söylemediği şeyleri kendinden emin bir dille anlatır.
      </p>
      <blockquote>
        <p>
          “Apex'i her müşteri günün her saatinde anında ve doğru bir yanıt alsın, destek ekipleri de sonunda zor vakalara
          odaklanabilsin diye geliştirdik.”
        </p>
        <p>— Mahmut Barış Akıntı, kurucu ve CEO</p>
      </blockquote>

      <h2 id="founder">Arkasında kim var?</h2>
      <p>
        Apex Bot, şirketi CEO olarak yöneten ve ürünü geliştiren <strong>Mahmut Barış Akıntı</strong> tarafından kuruldu.
      </p>

      <h2 id="principles">Kendimize koyduğumuz kurallar</h2>
      <ul>
        <li>
          <strong>İnternet değil, sizin içeriğiniz.</strong> Asistan yalnızca sayfalarınızdan ve eklediğiniz metinlerden
          yanıt verir, başka hiçbir kaynaktan değil. Ayrıntılar{" "}
          <a href="/tr/grounded-answers">kaynağa dayalı yanıtlar</a> sayfasında.
        </li>
        <li>
          <strong>Saldırıya uğrayacakmış gibi tasarlandı.</strong> Herkese açık bir chatbot hedeftir; bu yüzden alan adı
          kilidi, prompt injection'a karşı sağlamlaştırma, hız sınırları ve günlük bütçeler her sitede varsayılan olarak
          açıktır. Ürünün bugün yaptıkları <a href="/tr/security">güvenlik sayfamızda</a> listelenir.
        </li>
        <li>
          <strong>Varsayılan olarak gizlilik.</strong> Kişisel veriler loglarda maskelenir, konuşmalar seçtiğiniz süre
          sonunda silinir ve siz izin vermedikçe verileriniz model eğitiminde kullanılmaz.{" "}
          <a href="/tr/privacy">Gizlilik politikamız</a> KVKK ve GDPR'a uygun olarak yazılmıştır.
        </li>
        <li>
          <strong>Yalnızca İngilizce değil, yerel diller.</strong> Türkçe, İngilizce, Litvanca, Letonca ve Estonca hem
          yanıtlarda hem de widget'ın her kelimesinde tam olarak desteklenir.
        </li>
        <li>
          <strong>Yanıtlar, işlem yapmaz.</strong> Apex sipariş veremez, hesap değiştiremez, söz veremez. Ziyaretçinin bir
          insana ihtiyacı olduğunda konuşmayı e-postayla ekibinize devreder.
        </li>
      </ul>

      <h2 id="infrastructure">Nerede çalışıyor?</h2>
      <p>
        Sohbet API'si Almanya'nın Frankfurt kentinde, Render üzerinde çalışır. Web sitesi ve panel Vercel üzerinden sunulur;
        hesaplar ve ayarlar Supabase'deki yönetilen bir PostgreSQL veritabanında saklanır. Tüm hizmet sağlayıcıların listesi
        ve her birinin neleri gördüğü <a href="/tr/privacy">gizlilik politikasında</a> yer alır. Her hizmetin canlı durumunu{" "}
        <a href="/tr/status">durum sayfasından</a> görebilirsiniz.
      </p>

      <h2 id="contact">İletişim</h2>
      <p>
        Sorular, iş birlikleri veya basın için <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> adresine yazın. Her
        mesajı okuyoruz.
      </p>
    </>
  );
}

export const about: MarketingContent = {
  meta: {
    title: "Hakkımızda",
    description:
      "Yalnızca web sitenizden yanıt veren yapay zekâ asistanı Apex Bot'u neden geliştirdik ve hangi ilkelere bağlıyız: kaynağa dayalılık, güvenlik, gizlilik.",
    crumb: "Hakkımızda",
  },
  eyebrow: "Hakkımızda",
  title: "Yalnızca web sitenizin söylediğini söyleyen bir yapay zekâ asistanı",
  intro: "Apex Bot, işletmelerin her ziyaretçiyi günün her saatinde, hiçbir şey uydurmadan yanıtlamasına yardımcı olur.",
  body: Body,
};
