import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Alışverişçiler ne sorar?" },
  { id: "how", label: "Apex nasıl yanıtlar?" },
  { id: "orders", label: "Siparişe özel sorular" },
  { id: "setup", label: "Mağaza için kurulum" },
  { id: "costs", label: "Maliyetleri öngörülebilir tutmak" },
  { id: "faq", label: "Sorular" },
];

function Body() {
  return (
    <>
      <h2 id="questions">Alışverişçiler ne sorar?</h2>
      <p>
        Bir online mağazaya gelen mesajların çoğu aynı birkaç sorunun farklı halleridir ve yanıtları zaten mağazanın kendi
        sayfalarında yazılıdır:
      </p>
      <ul>
        <li>Kargo ne kadar sürer, şehrime veya ülkeme gönderim ücreti ne kadar?</li>
        <li>Bunu iade edebilir miyim, kaç günüm var, iade kargosunu kim öder?</li>
        <li>Hangi bedeni seçmeliyim? Ürün neyden yapılmış? Bu modele uyar mı?</li>
        <li>Hangi ödeme yöntemlerini kabul ediyorsunuz? Taksit var mı?</li>
        <li>Fiziksel mağazanız var mı, çalışma saatleri nedir?</li>
      </ul>
      <p>
        Alışverişçiler bu soruları gece ve hafta sonu, tam satın alma kararı vermeden önce sorar. O anda yanıtsız kalan bir
        soru çoğu zaman terk edilmiş bir sepettir.
      </p>

      <h2 id="how">Apex nasıl yanıtlar?</h2>
      <p>
        Apex Bot ürün, kargo, iade ve SSS sayfalarınızı okur ve sohbet widget'ında, günün her saati bunlardan yanıt verir.
        Her yanıt geldiği sayfanın bağlantısını gösterir; alışverişçi ayrıntıları kontrol eder ve sitenizde kalır.
      </p>
      <ul>
        <li>
          <strong>Uydurma politika yok.</strong> Apex yalnızca sayfalarınızda yazanı söyler. İade sayfanız bir durumdan
          bahsetmiyorsa asistan, uymak zorunda kalacağınız bir kural uydurmak yerine bilmediğini söyler.{" "}
          <a href="/tr/grounded-answers">Kaynağa dayalı yanıtlar nasıl çalışır?</a>
        </li>
        <li>
          <strong>Türkçe ve İngilizce.</strong> Alışverişçiler hangi dilde yazarsa o dilde yanıt alır; hem Türkiye'ye hem
          yurt dışına satış yapan mağazalar için idealdir.
        </li>
        <li>
          <strong>Potansiyel müşteri toplama.</strong> İsterseniz sohbet başlamadan önce isim, e-posta veya telefon
          isteyin; böylece bir soru takip edilebilir bir fırsata dönüşür.
        </li>
        <li>
          <strong>Mağazanıza benzer.</strong> Marka rengi, açılış ikonu, karşılama mesajı ve “Kargo süreleri” ya da “İade
          politikası” gibi önerilen sorular canlı önizlemeli ayarlardır.
        </li>
      </ul>

      <h2 id="orders">Siparişe özel sorular</h2>
      <p>
        Apex soruları yanıtlar, işlem yapmaz. Bir siparişi sorgulayamaz, adres değiştiremez veya iade başlatamaz; yapabiliyor
        gibi de davranmaz. “1234 numaralı siparişim nerede?” sorusunda yardım sayfalarınızdan sipariş takibinin nasıl
        yapıldığını anlatabilir ve <strong>insana devir</strong> önerebilir: alışverişçinin sorusu ve konuşmanın tamamı
        ekibinize e-postayla gider, siz yanıtladığınızda doğrudan onunla yazışırsınız.
      </p>
      <p className="callout">
        Asistanın mağaza yönetim panelinize veya müşteri verilerinize erişimi olmadığı için, onu manipüle etmeye çalışan bir
        ziyaretçi hiçbir şeyi göremez veya değiştiremez. En kötü ihtimal tek bir tuhaf sohbettir.
      </p>

      <h2 id="setup">Mağaza için kurulum</h2>
      <ol>
        <li>
          Mağazanızın adresini bilgi kaynağı olarak ekleyin. Apex site haritanızı ve bağlantılı sayfaları sayfa sınırınıza
          kadar okur. Kargo, iade, ödeme ve beden rehberi sayfalarının dahil olduğundan emin olun.
        </li>
        <li>
          Kargo firmasının son teslim saatleri veya hasarlı paketleri nasıl ele aldığınız gibi henüz sitenizde olmayan
          bilgiler için metin kaynağı ekleyin.
        </li>
        <li>Karşılama mesajını ve müşterilerinizin en çok sorduğu iki üç öneri sorusunu ayarlayın.</li>
        <li>
          Yerleştirme kodunu temanıza yapıştırın. <a href="/tr/integrations/shopify">Shopify</a> ve{" "}
          <a href="/tr/integrations/wordpress">WordPress / WooCommerce</a> için adım adım rehberler var; Wix, Squarespace ve
          diğerleri <a href="/tr/docs#platforms">dokümantasyonda</a>.
        </li>
        <li>
          <em>İzinli web siteleri</em> altına hem <code>https://magazaniz.com</code> hem de{" "}
          <code>https://www.magazaniz.com</code> adresini ekleyin. Widget yalnızca listelediğiniz adreslerde çalışır.
        </li>
      </ol>

      <h2 id="costs">Maliyetleri öngörülebilir tutmak</h2>
      <p>
        Yoğun bir mağaza sürpriz bir faturayla karşılaşmamalı. Her asistanın ziyaretçi başına hız sınırı, maksimum mesaj
        uzunluğu ve günlük token bütçesi vardır. Bütçe dolduğunda sohbet, maliyet biriktirmek yerine bir sonraki UTC gününe
        kadar insana devir önerir. Apex beta süresince ücretsiz; sonrası için planlar{" "}
        <a href="/tr/pricing">fiyatlandırma sayfasında</a>.
      </p>

      <h2 id="faq">Sorular</h2>
      <h3>Ürün önerebilir mi?</h3>
      <p>
        Ürün sayfalarınızda yazanlara dayanarak ürünleri anlatabilir, karşılaştırabilir ve bağlantı verebilir. Okuduğu
        sayfalarda olmayan anlık stok ve fiyatları göremez; büyük katalog değişikliklerinden sonra web sitenizi yeniden
        senkronize edin.
      </p>
      <h3>Ödeme sayfasında çalışır mı?</h3>
      <p>
        Temanızın yerleştirme kodunu yüklediği her yerde çalışır. Shopify gibi bazı platformlar ödeme sayfalarında tema
        kodunu yüklemez; bu yüzden sohbet mağaza sayfalarınızda görünür, ödeme adımında görünmez.
      </p>
      <h3>Alışverişçilerin verileri güvende mi?</h3>
      <p>
        E-posta, telefon ve kart numaraları loglara yazılmadan önce maskelenir, konuşmalar seçtiğiniz saklama süresi sonunda
        silinir ve widget çerez kullanmaz. Bkz. <a href="/tr/security">güvenlik</a> ve <a href="/tr/privacy">gizlilik</a>.
      </p>
    </>
  );
}

export const ecommerce: MarketingContent = {
  meta: {
    title: "E-ticaret siteleri için yapay zekâ chatbot",
    description:
      "Kargo, iade, beden ve ödeme sorularını yalnızca mağaza sayfalarınızı kullanan bir yapay zekâ chatbot ile 7/24 yanıtlayın. Türkçe ve İngilizce.",
    crumb: "E-ticaret",
  },
  eyebrow: "E-ticaret için",
  title: "Asla iade politikası uydurmayan, online mağazalar için yapay zekâ chatbot",
  intro:
    "Kargo, iade, beden ve ödeme sorularını kendi mağaza sayfalarınızdan, günün her saati Türkçe ve İngilizce yanıtlayın.",
  toc: TOC,
  body: Body,
};
