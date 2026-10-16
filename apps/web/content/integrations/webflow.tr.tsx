import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Başlamadan önce" },
  { id: "site-wide", label: "Tüm sayfalara ekleyin" },
  { id: "single-page", label: "Ya da tek bir sayfaya" },
  { id: "allow", label: "Alan adlarınıza izin verin" },
  { id: "notes", label: "Bilmeniz gerekenler" },
];

function Body() {
  return (
    <>
      <h2 id="before">Başlamadan önce</h2>
      <p>
        Yerleştirme kodunuzu <em>Panel → Widget → Kurulum ve güvenlik</em> ekranından kopyalayın. Kodda size özel site
        anahtarı hazır olarak bulunur ve şöyle görünür:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>Webflow, özel kodu yalnızca ücretli site planı olan sitelerde çalıştırır.</p>

      <h2 id="site-wide">Tüm sayfalara ekleyin</h2>
      <ol>
        <li>
          Projenizin <em>Site settings</em> ekranını açın ve <em>Custom code</em> sekmesine gidin.
        </li>
        <li>
          Yerleştirme kodunu <strong>Footer code</strong> kutusuna (<code>&lt;/body&gt;</code> etiketinden önceki kod için
          olan kutu) yapıştırın.
        </li>
        <li>
          <em>Save changes</em> düğmesine tıklayın, ardından sitenizi <strong>yayınlayın</strong>. Özel kod Designer'da değil,
          yalnızca yayındaki sitede çalışır.
        </li>
      </ol>

      <h2 id="single-page">Ya da tek bir sayfaya</h2>
      <p>
        Sohbeti yalnızca bir sayfada göstermek için Designer'da o sayfanın ayarlarını açın, kodu{" "}
        <em>Custom code → Before &lt;/body&gt; tag</em> alanına yapıştırın ve yayınlayın. Birkaç sayfa dışında her yerde
        göstermek için kodu site geneline ekleyin ve istisnaları Apex panelinizde <em>Davranış → Bu sayfalarda gizle</em>{" "}
        altında listeleyin.
      </p>

      <h2 id="allow">Alan adlarınıza izin verin</h2>
      <p>
        <em>İzinli web siteleri</em> altına <code>www</code> olan ve olmayan özel alan adınızı ekleyin. Önce Webflow'un
        test adresinde denemek için <code>https://siteniz.webflow.io</code> adresini de ekleyin. Widget yalnızca listelenen
        adreslerde çalışır.
      </p>

      <h2 id="notes">Bilmeniz gerekenler</h2>
      <ul>
        <li>
          <strong>Bilgi tabanı.</strong> Yayındaki sitenizi bilgi kaynağı olarak ekleyin. Apex site haritanızı ve CMS
          koleksiyon sayfaları dahil bağlantılı sayfaları sayfa sınırınıza kadar okur. Büyük değişiklikleri yayınladıktan
          sonra yeniden senkronize edin.
        </li>
        <li>
          <strong>Stil.</strong> Widget bir Shadow DOM içinde çizilir; Webflow stilleriniz onu bozamaz. Renkler, sohbet
          düğmesi ve konum Apex panelinden ayarlanır.
        </li>
        <li>
          <strong>Bir düğmeden açmak.</strong> Bir düğmeye kimlik verin (örneğin <code>help</code>) ve yerleştirme kodundan
          sonra{" "}
          <code>
            {`<script>document.getElementById("help").onclick = () => Apex.open()</script>`}
          </code>{" "}
          ekleyin. Bkz. <a href="/tr/docs#javascript-api">JavaScript API</a>.
        </li>
      </ul>
      <p>
        Sohbet düğmesi görünmüyorsa <a href="/tr/docs#troubleshooting">sorun giderme</a> bölümüne bakın.
      </p>
    </>
  );
}

export const webflow: MarketingContent = {
  meta: {
    title: "Webflow sitenize yapay zekâ chatbot ekleyin",
    description:
      "Yapay zekâ destek chatbotunu site geneli veya sayfa bazlı özel kodla birkaç dakikada Webflow sitenize ekleyin. Yanıtlar yalnızca sayfalarınızdan gelir.",
    crumb: "Webflow",
  },
  eyebrow: "Webflow",
  title: "Webflow sitenize yapay zekâ chatbot nasıl eklenir?",
  intro:
    "Sitenizin özel koduna tek satır yapıştırın, yayınlayın; Apex Bot ziyaretçilerinizi kendi Webflow sayfalarınızdan yanıtlasın.",
  toc: TOC,
  body: Body,
};
