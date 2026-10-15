import { localizePath } from "@/lib/i18n";
import { apiUrl, embedSnippet } from "@/lib/site";
import type { ProseContent } from "../types";

const TOC: ProseContent["toc"] = [
  { id: "setup", label: "Kurulum rehberi" },
  { id: "knowledge", label: "Bilgi tabanı" },
  { id: "customize", label: "Özelleştirme" },
  { id: "install", label: "Widget'ı yükleyin" },
  { id: "platforms", label: "Platformlar" },
  { id: "javascript-api", label: "JavaScript API" },
  { id: "privacy", label: "Gizlilik ayarları" },
  { id: "troubleshooting", label: "Sorun giderme" },
];

const API_EXAMPLE = `<script>
  // İsteğe bağlı ayarlar; widget yüklenirken okunur
  window.Apex = {
    lang: "auto",                 // "auto", "tr" veya "en"
    greeting: "Merhaba! Mağazamızla ilgili her şeyi sorabilirsiniz.",
    suggestions: ["Kargo süreleri", "İade koşulları"],
    theme: { primary: "#312c85", position: "bottom-right" },
  };
</script>`;

const METHODS_EXAMPLE = `Apex.open()                          // sohbeti açar
Apex.close()                         // kapatır
Apex.toggle()                        // açar ya da kapatır
Apex.send("Siparişim nerede?")       // açar ve soruyu gönderir
Apex.identify({ name: "Ada", email: "ada@example.com" })

Apex.on("message", (m) => console.log(m.text, m.sources))
Apex.on("open", () => analytics.track("chat_opened"))`;

// The dashboard is still English-only, so menu paths keep the labels people see on screen
function Body() {
  const snippet = embedSnippet("apex_pk_…");
  return (
    <>
      <h2 id="setup">Kurulum rehberi</h2>
      <ol>
        <li>
          <strong>Hesabınızı oluşturun</strong> ve e-postanızı doğrulayın. Çalışma alanınız ve asistanınız otomatik olarak
          oluşturulur.
        </li>
        <li>
          <strong>Bilgi ekleyin.</strong> Apex'e web sitenizin adresini verin, sayfalarınızı okusun. İnternette olmayan
          bilgileri metin olarak ekleyin.
        </li>
        <li>
          <em>Dashboard → Widget</em> altında <strong>widget'ı özelleştirin</strong>: isim, renkler, karşılama mesajı, üslup ve
          model.
        </li>
        <li>
          <em>Install &amp; security</em> altında <strong>web sitenize izin verin</strong>. Widget yalnızca orada listelenen
          adreslerde çalışır.
        </li>
        <li>
          <strong>Yerleştirme kodunu</strong> sitenize yapıştırın ve bir konuşmayı denemek için sitenizi açın.
        </li>
      </ol>
      <p>
        Panelinizdeki <em>Setup</em> kontrol listesi bu adımları sizin için takip eder.
      </p>

      <h2 id="knowledge">Bilgi tabanı</h2>
      <p>
        Apex yalnızca ona verdiğiniz içerikten yanıt verir. <em>Dashboard → Knowledge</em> altında iki tür kaynak ekleyebilirsiniz:
      </p>
      <ul>
        <li>
          <strong>Web sitesi.</strong> Apex girdiğiniz sayfayı, site haritanızı ve bunların aynı alan adında bağlantı verdiği
          sayfaları, sayfa limitine kadar okur. <code>robots.txt</code> kurallarına uyar; menüleri, alt bilgileri ve çerez
          bannerlarını atlar. Siteniz değiştiğinde yeniden senkronize edin.
        </li>
        <li>
          <strong>Metin.</strong> Web sitenizde olmayan SSS'leri, politikaları veya ürün bilgilerini yapıştırın. Her birine
          açık bir başlık verin; bu başlık, o metni kullanan yanıtlarda kaynak olarak gösterilir.
        </li>
      </ul>
      <p>
        Bilgi tabanınızdaki hiçbir şey bir soruyla yeterince eşleşmediğinde asistan tahmin yürütmek yerine bilmediğini
        söyler ve açtıysanız ekibinize devretmeyi önerir. Eşleşmenin ne kadar yakın olması gerektiğini <em>Persona</em>{" "}
        altındaki <em>Answer confidence</em> ayarı belirler.
      </p>

      <h2 id="customize">Özelleştirme</h2>
      <p>Widget stüdyosundaki her ayarın canlı önizlemesi vardır. En önemlileri:</p>
      <table>
        <thead>
          <tr>
            <th>Bölüm</th>
            <th>Neyi kontrol eder</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>General</td>
            <td>Bot ve şirket adı, başlık altyazısı, varsayılan dil ve arayüz dili</td>
          </tr>
          <tr>
            <td>Appearance</td>
            <td>Marka rengi, tema, açılış simgesi, etiketi ve konumu, pencere genişliği, köşe yuvarlaklığı ve yazı tipi</td>
          </tr>
          <tr>
            <td>Messages</td>
            <td>Karşılama mesajı, önerilen sorular, “bilmiyorum” yanıtı, uyarı metni ve gizlilik bağlantısı</td>
          </tr>
          <tr>
            <td>Behavior</td>
            <td>Otomatik açılma, tanıtım balonu, kaynaklar, geri bildirim, sohbetlerin ne kadar süre hatırlanacağı ve gizlenecek sayfalar</td>
          </tr>
          <tr>
            <td>AI model</td>
            <td>Sağlayıcı, model, yaratıcılık, yanıt derinliği, yanıt uzunluğu, bellek ve yedek model</td>
          </tr>
          <tr>
            <td>Persona</td>
            <td>Üslup, yanıt uzunluğu, emoji, kendi talimatlarınız, reddedilecek konular ve yanıt güveni</td>
          </tr>
          <tr>
            <td>Hand-off &amp; leads</td>
            <td>Devir taleplerini alan e-posta adresi ve sohbet öncesi isteğe bağlı iletişim formu</td>
          </tr>
        </tbody>
      </table>
      <p>Değişiklikler, kaydettikten sonra yaklaşık bir dakika içinde canlı widget'ınıza yansır.</p>

      <h2 id="install">Widget'ı yükleyin</h2>
      <p>
        Yerleştirme kodunu <em>Dashboard → Widget → Install &amp; security</em> ekranından kopyalayın. Kodda size özel site
        anahtarınız hazır olarak bulunur ve şöyle görünür:
      </p>
      <pre>
        <code>{snippet}</code>
      </pre>
      <p>
        Sohbetin görünmesini istediğiniz her sayfada kodu kapanış <code>&lt;/body&gt;</code> etiketinin hemen önüne
        yapıştırın. Ardından ziyaretçilerin kullandığı her adresi, örneğin <code>https://example.com</code> ve{" "}
        <code>https://www.example.com</code>, <em>Allowed websites</em> altına ekleyin.
      </p>
      <p className="callout">
        Site anahtarı tasarım gereği herkese açıktır: yalnızca izin verdiğiniz web sitelerinde çalışır. Kötüye kullanıldığını
        düşünüyorsanız aynı ekrandan yenileyin ve sitenizdeki kodu güncelleyin.
      </p>

      <h2 id="platforms">Platformlar</h2>
      <h3>WordPress</h3>
      <p>
        Bir header/footer kod eklentisi (örneğin <em>WPCode</em>) kullanarak kodu site genelindeki alt bilgiye ekleyin ya da
        temanızın <code>footer.php</code> dosyasında <code>&lt;/body&gt;</code> öncesine yapıştırın.
      </p>
      <h3>Shopify</h3>
      <p>
        <em>Online Mağaza → Temalar → Kodu düzenle</em> yolunu izleyin, <code>layout/theme.liquid</code> dosyasını açın ve
        kodu <code>&lt;/body&gt;</code> öncesine yapıştırın.
      </p>
      <h3>Webflow, Wix ve Squarespace</h3>
      <p>
        Kodu alt bilgiye site genelinde özel kod olarak ekleyin: <em>Site settings → Custom code</em> (Webflow),{" "}
        <em>Ayarlar → Özel kod</em> (Wix) veya <em>Settings → Advanced → Code injection</em> (Squarespace).
      </p>
      <h3>React, Next.js ve diğer tek sayfalı uygulamalar</h3>
      <p>
        Betiği bir kez, örneğin kök layout'unuzda yükleyin. Widget, istemci tarafı sayfa geçişlerinde konuşmayı kendiliğinden
        korur.
      </p>

      <h2 id="javascript-api">JavaScript API</h2>
      <p>
        Belirli bir sayfada birkaç ayarı geçersiz kılmak için isteğe bağlı olarak betik yüklenmeden önce{" "}
        <code>window.Apex</code> değerini tanımlayın:
      </p>
      <pre>
        <code>{API_EXAMPLE}</code>
      </pre>
      <p>
        Yüklendikten sonra <code>window.Apex</code>, widget'ı kendi kodunuzla yönetmenizi sağlar. Yüklenmeden önce yapılan
        çağrılar sıraya alınır ve sırayla çalıştırılır.
      </p>
      <pre>
        <code>{METHODS_EXAMPLE}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Olay</th>
            <th>Ne zaman tetiklenir</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>open</code> / <code>close</code>
            </td>
            <td>Sohbet penceresi açıldığında veya kapandığında</td>
          </tr>
          <tr>
            <td>
              <code>message</code>
            </td>
            <td>
              Bir yanıtın akışı tamamlandığında; <code>{"{ text, sources }"}</code> alır
            </td>
          </tr>
          <tr>
            <td>
              <code>lead</code>
            </td>
            <td>
              Ziyaretçi iletişim formunu gönderdiğinde; <code>{"{ email, name, phone }"}</code> alır
            </td>
          </tr>
          <tr>
            <td>
              <code>handoff</code>
            </td>
            <td>Ziyaretçi “Bir insanla konuş” talebi gönderdiğinde</td>
          </tr>
        </tbody>
      </table>

      <h2 id="privacy">Gizlilik ayarları</h2>
      <ul>
        <li>
          Konuşmalar, <em>Install &amp; security</em> altında belirlediğiniz saklama süresinin sonunda otomatik olarak silinir
          (varsayılan 30 gün).
        </li>
        <li>
          Ziyaretçiler istedikleri zaman yeni bir sohbet başlatabilir; bu, eski sohbeti tarayıcılarından temizler. Kayıtlı
          herhangi bir konuşmayı <em>Conversations</em> sayfasından silebilirsiniz.
        </li>
        <li>E-posta adresleri, telefon ve kart numaraları kayıtlarımızda maskelenir.</li>
        <li>
          Widget'ın alt kısmında göstermek için gizlilik politikanızın bağlantısını <em>Messages</em> altına ekleyin.
        </li>
      </ul>

      <h2 id="troubleshooting">Sorun giderme</h2>
      <h3>Açılış düğmesi görünmüyor</h3>
      <ul>
        <li>
          Sayfanın tam adresinin (<code>www</code> ve <code>https</code> dahil) <em>Allowed websites</em> altında
          listelendiğini kontrol edin. Listelenmemişse tarayıcı konsolunda{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code> mesajı görünür.
        </li>
        <li>
          Sayfanın <em>Behavior → Hide on these pages</em> altındaki yollardan birinde olmadığını kontrol edin.
        </li>
        <li>
          Koddaki <code>src</code> değerinin <code>{apiUrl()}/widget.js</code> adresini gösterdiğinden ve site anahtarının
          paneldekiyle aynı olduğundan emin olun. Anahtarı yeniledikten sonra eski kod çalışmaz.
        </li>
      </ul>
      <h3>Çok sık “bilmiyorum” diyor</h3>
      <ul>
        <li>
          <em>Knowledge</em> sayfasını kontrol edin: başarısız olan ya da az sayfa bulan bir web sitesi kaynağı nedenini gösterir.
        </li>
        <li>Eksik bilgileri metin kaynağı olarak ekleyin.</li>
        <li>
          Küçük bilgi tabanları için <em>Persona → Answer confidence</em> ayarını <em>Lenient</em> yapın.
        </li>
      </ul>
      <h3>Yanıtlar durdu</h3>
      <p>
        <em>Install &amp; security</em> altındaki günlük token bütçesi dolmuş olabilir; bu durumda sohbet UTC gece yarısına kadar
        insana devir önerir. <a href={localizePath("/status", "tr")}>Sistem durumu</a> sayfasına da göz atabilirsiniz.
      </p>
    </>
  );
}

export const docs: ProseContent = {
  eyebrow: "Dokümantasyon",
  title: "Apex Bot kurulumu",
  intro: "Kayıttan web sitenizde çalışan bir asistana kadar ihtiyacınız olan her şey. Çoğu site on dakikadan kısa sürede hazır olur.",
  toc: TOC,
  body: Body,
};
