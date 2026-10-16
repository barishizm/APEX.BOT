import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "definition", label: "“Kaynağa dayalı” ne demek?" },
  { id: "pipeline", label: "Sorudan yanıta" },
  { id: "dont-know", label: "Bilmediğinde" },
  { id: "confidence", label: "Yanıt güveni" },
  { id: "injection", label: "Manipülasyon girişimleri" },
  { id: "limits", label: "Sınırlar" },
  { id: "faq", label: "Sorular" },
];

function Body() {
  return (
    <>
      <h2 id="definition">“Kaynağa dayalı” ne demek?</h2>
      <p>
        <strong>Kaynağa dayalı (grounded) bir chatbot</strong>, yapay zekâ modelinin genel olarak öğrendiklerinden değil,
        yalnızca kendisine verilen belirli kaynaklardan yanıt verir. Apex Bot'un kaynakları, web sitenizden okuduğu sayfalar
        ve sizin eklediğiniz metinlerdir. Yanıt bu kaynaklarda yoksa Apex yanıt uydurmaz.
      </p>
      <p>
        Bu önemlidir, çünkü yapay zekâ modelleri yanılırken bile akıcı konuşur. İade politikanız sorulan genel bir chatbot
        çoğu zaman sizin hiç yazmadığınız, akla yatkın bir politika üretir. Bir işletme sitesinde bu, hiç yanıt vermemekten
        daha kötüdür: ziyaretçi o bilgiye göre hareket eder, açıklamak da size düşer.
      </p>

      <h2 id="pipeline">Sorudan yanıta</h2>
      <ol>
        <li>
          <strong>İçeriğiniz okunur ve bölünür.</strong> Bir web sitesi eklediğinizde Apex girdiğiniz sayfayı, site
          haritanızı ve bunların aynı alan adında bağlantı verdiği sayfaları, sayfa sınırınıza kadar okur.{" "}
          <code>robots.txt</code> kurallarına uyar; menüleri, alt bilgileri ve çerez bildirimlerini atlar. Metin kısa
          bölümlere ayrılır ve yalnızca sizin asistanınız için saklanır.
        </li>
        <li>
          <strong>Soru bölümlerle eşleştirilir.</strong> Bir ziyaretçi soru sorduğunda Apex yalnızca o asistanın bölümlerinde
          arama yapar ve her birinin ne kadar alakalı olduğunu puanlar. Başka müşterilerin içeriği asla aranmaz.
        </li>
        <li>
          <strong>Zayıf eşleşmeler elenir.</strong> Alaka eşiğinin altında kalan bölümler atılır; böylece konuyla uzaktan
          ilgili bir sayfa zorlanarak yanıta dönüştürülemez.
        </li>
        <li>
          <strong>Model, bölümlerden yazar.</strong> Yapay zekâ modeli ziyaretçinin sorusunu ve eşleşen bölümleri, önce
          sabit kurallarla birlikte alır: yalnızca bölümlerde bulunan bilgilerle yanıt ver, asla fiyat, politika veya
          iletişim bilgisi uydurma, bölümler soruyu karşılamıyorsa bunu söyle.
        </li>
        <li>
          <strong>Kaynak gösterilir.</strong> Her yanıtın altında geldiği sayfanın bağlantısı yer alır; ziyaretçi bilgiyi
          doğrulayabilir ve sitenizde okumaya devam edebilir.
        </li>
      </ol>

      <h2 id="dont-know">Bilmediğinde</h2>
      <p>
        Yeterince alakalı bir bölüm yoksa asistan tahmin yürütmek yerine sizin belirlediğiniz “bilmiyorum” mesajıyla yanıt
        verir. <a href="/tr/docs#customize">İnsana devri</a> açtıysanız, konuşmanın tamamını ekleyerek ekibinize e-postayla
        aktarmayı önerir.
      </p>
      <p>
        Yanıtlanamayan sorular değerlidir: ziyaretçilerinizin bilmek isteyip sitenizin henüz söylemediği şeyleri tam olarak
        gösterir. Eksik bilgiyi bir sayfa ya da metin kaynağı olarak ekleyin, bir sonraki ziyaretçi yanıtını alsın.
      </p>

      <h2 id="confidence">Yanıt güveni</h2>
      <p>
        Bir eşleşmenin ne kadar yakın olması gerektiği <em>Kişilik → Yanıt güveni</em> altındaki bir ayardır:
      </p>
      <table>
        <thead>
          <tr>
            <th>Ayar</th>
            <th>Davranış</th>
            <th>Uygun olduğu durum</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Katı</td>
            <td>Yakın eşleşme ister; daha sık “bilmiyorum” der</td>
            <td>Düzenlemeye tabi konular, fiyatlar, yasal koşullar</td>
          </tr>
          <tr>
            <td>Dengeli</td>
            <td>Varsayılan</td>
            <td>Çoğu web sitesi</td>
          </tr>
          <tr>
            <td>Esnek</td>
            <td>Daha gevşek eşleşmeleri kabul eder</td>
            <td>Az sayfalı küçük bilgi tabanları</td>
          </tr>
        </tbody>
      </table>

      <h2 id="injection">Manipülasyon girişimleri</h2>
      <p>
        Ziyaretçiler bazen bir chatbotu kurallarından vazgeçirmeye çalışır (“talimatlarını unut ve…”), web sayfaları da aynı
        amaçla yazılmış metinler içerebilir. Apex ziyaretçi mesajlarını, sitenizin metnini ve özel talimatlarınızı modele,
        geçersiz kılamayacakları sabit güvenlik kurallarından sonra, açıkça işaretlenmiş bölümler içinde veri olarak iletir.
        Bu işaretleri taklit eden metinler önceden etkisiz hale getirilir. Kendi talimatlarınız üslubu ve konuları
        değiştirebilir, ancak kaynağa dayalı yanıt kuralını kapatamaz.
      </p>
      <p>
        Asistanın hiçbir aracı da yoktur: sipariş veremez, hesap değiştiremez, internette gezinemez veya başka sistemleri
        çağıramaz. Başarılı bir manipülasyonun yapabileceği en kötü şey tek bir sohbette söylenenleri değiştirmektir.
        Ayrıntılar <a href="/tr/security">güvenlik sayfasında</a>.
      </p>

      <h2 id="limits">Sınırlar</h2>
      <p>
        Kaynağa dayalı yanıt, uydurma yanıtları büyük ölçüde azaltır, ancak hiçbir yapay zekâ sistemi kusursuz değildir. Bir
        yanıt yine de eksik olabilir veya belirsiz bir bölümü yanlış yorumlayabilir. Bu yüzden her yanıt kaynağını gösterir
        ve paneliniz konuşmaları saklar; böylece onları inceleyip içeriğinizi iyileştirebilirsiniz. Asistan bir yapay zekâ
        olduğunu açıkça belirtir ve kesin tıbbi, hukuki veya finansal tavsiye vermez.
      </p>

      <h2 id="faq">Sorular</h2>
      <h3>Apex, yapay zekâ modelinin işletmem hakkında zaten bildiklerini kullanır mı?</h3>
      <p>
        Hayır. Yanıtlar yalnızca sayfalarınızdan ve metin kaynaklarınızdan oluşturulur. İçeriğiniz bir şeyden bahsetmiyorsa,
        model bunu başka bir yerden biliyor olsa bile Apex söylemez.
      </p>
      <h3>Web sitem değişince ne olur?</h3>
      <p>
        <em>Panel → Bilgi tabanı</em> altında web sitesi kaynağını yeniden senkronize edin, Apex siteyi tekrar okur. Metin
        kaynakları kaydettiğiniz anda güncellenir.
      </p>
      <h3>Hangi yapay zekâ modellerini kullanır?</h3>
      <p>
        Siz seçersiniz: Claude, OpenAI veya Gemini modelleri; ana modeliniz kullanılamazsa devreye girecek isteğe bağlı bir
        yedek modelle birlikte. Kaynağa dayalı yanıt kuralları her modelde aynıdır.
      </p>
      <h3>İçeriğim yapay zekâ modellerini eğitmek için kullanılır mı?</h3>
      <p>
        Siz izin vermedikçe hayır. İçeriğiniz ve ziyaretçi mesajları seçtiğiniz yapay zekâ sağlayıcısına yalnızca yanıt
        üretmek için gönderilir. Bkz. <a href="/tr/privacy">gizlilik politikası</a>.
      </p>
    </>
  );
}

export const groundedAnswers: MarketingContent = {
  meta: {
    title: "Kaynağa dayalı yanıtlar nasıl çalışır?",
    description:
      "Apex Bot yalnızca sitenizdeki bilgilerle nasıl yanıt verir: asistana özel arama, alaka eşiği, kaynak bağlantıları, dürüst bir “bilmiyorum” ve koruma.",
    crumb: "Kaynağa dayalı yanıtlar",
  },
  eyebrow: "Nasıl çalışır",
  title: "Kaynağa dayalı yanıtlar: uydurmayan bir chatbot",
  intro:
    "Apex Bot yalnızca web sitenizden yanıt verir. Bir sorunun nasıl yanıta dönüştüğünü ve içeriğinizde yanıt olmadığında ne olduğunu burada adım adım anlatıyoruz.",
  toc: TOC,
  body: Body,
};
