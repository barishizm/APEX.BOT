import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Başlamadan önce" },
  { id: "plugin", label: "1. yol: kod eklentisi" },
  { id: "theme", label: "2. yol: temanız" },
  { id: "allow", label: "Alan adınıza izin verin" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "troubleshooting", label: "Sorun giderme" },
];

function Body() {
  return (
    <>
      <h2 id="before">Başlamadan önce</h2>
      <p>
        <em>Panel → Widget → Kurulum ve güvenlik</em> ekranındaki yerleştirme kodunuza ihtiyacınız var. Kodda size özel
        site anahtarı hazır olarak bulunur ve şöyle görünür:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Asistan göründüğü andan itibaren yanıt verebilsin diye önce web sitenizi bilgi kaynağı olarak ekleyin.
        WordPress.com'da kod veya eklenti eklemek, eklentilere izin veren bir plan gerektirir; kendi sunucunuzdaki
        WordPress'te böyle bir sınır yoktur.
      </p>

      <h2 id="plugin">1. yol: kod eklentisi (önerilen)</h2>
      <p>Header ve footer eklentisi, kodu tema güncellemelerinden korur ve her temayla çalışır.</p>
      <ol>
        <li>
          WordPress yönetim panelinde <em>Eklentiler → Yeni Ekle</em> bölümüne gidin, <strong>WPCode</strong> aratın, kurun
          ve etkinleştirin.
        </li>
        <li>
          <em>Code Snippets → Header &amp; Footer</em> ekranını açın.
        </li>
        <li>
          Yerleştirme kodunu <strong>Footer</strong> kutusuna yapıştırın ve <em>Save Changes</em> düğmesine tıklayın.
        </li>
        <li>Sitenizi yeni bir sekmede açın. Sohbet düğmesi seçtiğiniz köşede görünür.</li>
      </ol>

      <h2 id="theme">2. yol: temanız</h2>
      <p>
        Klasik bir temada <em>Görünüm → Tema Dosya Düzenleyici</em> bölümüne gidin, <code>footer.php</code> dosyasını açın
        ve kodu <code>&lt;/body&gt;</code> etiketinin hemen öncesine yapıştırın. Bir alt tema (child theme) kullanın; aksi
        halde tema güncellendiğinde kod silinir. Blok temalarda <code>footer.php</code> yoktur; bunun yerine eklenti yolunu
        kullanın.
      </p>

      <h2 id="allow">Alan adınıza izin verin</h2>
      <p>
        <em>İzinli web siteleri</em> altına ziyaretçilerin kullandığı her adresi ekleyin; örneğin{" "}
        <code>https://ornek.com</code> ve <code>https://www.ornek.com</code>. Widget yalnızca listelenen adreslerde çalışır,
        kopyalanan kod başkasının sitesinde işe yaramaz.
      </p>

      <h2 id="woocommerce">WooCommerce</h2>
      <p>
        WooCommerce mağazalarında kurulum aynıdır. Kargo, iade ve ödeme sayfalarınızın bilgi kaynağına dahil olduğundan emin
        olun; kapsamadıkları her şey için metin kaynağı ekleyin. Mağazada neyin iyi çalıştığı için{" "}
        <a href="/tr/use-cases/e-commerce">e-ticaret için Apex</a> sayfasına bakın.
      </p>

      <h2 id="troubleshooting">Sorun giderme</h2>
      <ul>
        <li>
          <strong>Sohbet düğmesi görünmüyor.</strong> Tarayıcı konsolunu açın. <code>[Apex] Widget disabled:
          origin_not_allowed</code> mesajı, <code>www</code> ve <code>https</code> dahil tam adresin{" "}
          <em>İzinli web siteleri</em> listesinde olmadığı anlamına gelir.
        </li>
        <li>
          <strong>Önbellek eklentisinden sonra çalışmayı bıraktı.</strong> Önbelleği temizleyin. JavaScript “geciktirme”
          veya “birleştirme” özelliklerini (WP Rocket, LiteSpeed Cache, Autoptimize ve benzerleri) kullanıyorsanız{" "}
          <code>widget.js</code> dosyasını bunların dışında tutun.
        </li>
        <li>
          <strong>Görünmemesi gereken sayfalarda görünüyor.</strong> Bu yolları{" "}
          <em>Davranış → Bu sayfalarda gizle</em> altına ekleyin.
        </li>
      </ul>
      <p>
        Daha fazlası <a href="/tr/docs#troubleshooting">dokümantasyonda</a>.
      </p>
    </>
  );
}

export const wordpress: MarketingContent = {
  meta: {
    title: "WordPress sitenize yapay zekâ chatbot ekleyin",
    description:
      "Yapay zekâ destek chatbotunu bir kod eklentisi veya temanızla birkaç dakikada her WordPress ya da WooCommerce sitesine ekleyin. Adım adım rehber.",
    crumb: "WordPress",
  },
  eyebrow: "WordPress",
  title: "WordPress sitenize yapay zekâ chatbot nasıl eklenir?",
  intro:
    "Apex Bot her WordPress ve WooCommerce sitesinde çalışır. Tek satır kodu bir eklentiyle veya temanıza yapıştırın; ziyaretçileriniz yanıtlarını kendi sayfalarınızdan alsın.",
  toc: TOC,
  body: Body,
};
