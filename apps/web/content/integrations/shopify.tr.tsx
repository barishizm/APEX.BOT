import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Başlamadan önce" },
  { id: "install", label: "Temanıza ekleyin" },
  { id: "allow", label: "Mağaza alan adlarınıza izin verin" },
  { id: "knowledge", label: "Ona ne vermeli?" },
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
      <p>
        Tema kodunu düzenlemek güvenlidir, ancak geri dönebileceğiniz bir kopyanız olsun diye önce temanızı çoğaltmanız (
        <em>… → Çoğalt</em>) iyi bir alışkanlıktır.
      </p>

      <h2 id="install">Temanıza ekleyin</h2>
      <ol>
        <li>
          Shopify yönetim panelinizde <em>Online Mağaza → Temalar</em> bölümüne gidin.
        </li>
        <li>
          Mevcut temanızın yanındaki <em>…</em> düğmesine tıklayın ve <em>Kodu düzenle</em> seçeneğini seçin.
        </li>
        <li>
          <em>Layout</em> altında <code>theme.liquid</code> dosyasını açın.
        </li>
        <li>
          Dosyanın sonuna yakın kapanış <code>&lt;/body&gt;</code> etiketini bulun ve yerleştirme kodunu hemen üstüne
          yapıştırın.
        </li>
        <li>
          <em>Kaydet</em> düğmesine tıklayın ve mağazanızı yeni bir sekmede açın. Sohbet düğmesi her sayfada görünür.
        </li>
      </ol>

      <h2 id="allow">Mağaza alan adlarınıza izin verin</h2>
      <p>
        <em>İzinli web siteleri</em> altına mağazanıza ulaşılan her adresi ekleyin: <code>www</code> olan ve olmayan
        kendi alan adınız ve siz veya ziyaretçileriniz kullanıyorsa <code>magazaniz.myshopify.com</code> adresi. Widget
        yalnızca listelenen adreslerde çalışır.
      </p>

      <h2 id="knowledge">Ona ne vermeli?</h2>
      <p>
        Mağazanızın adresini bilgi kaynağı olarak ekleyin. Apex site haritanızı ve bağlantı verdiği sayfaları sayfa
        sınırınıza kadar okur. Kargo, iade ve ödeme politikalarınızın ve SSS sayfanızın dahil olduğunu kontrol edin;
        Shopify'ın politika sayfaları <code>/policies/</code> altında yer alır. Mağazanızda henüz olmayan her şey için metin
        kaynağı ekleyin. Daha fazla fikir için <a href="/tr/use-cases/e-commerce">e-ticaret için Apex</a>.
      </p>

      <h2 id="notes">Bilmeniz gerekenler</h2>
      <ul>
        <li>
          <strong>Ödeme sayfası.</strong> Shopify ödeme sayfalarında tema kodunu yüklemez; sohbet mağaza sayfalarınızda
          görünür, ödeme adımında görünmez.
        </li>
        <li>
          <strong>Tema değiştirme.</strong> Kod temanın içinde yaşar. Farklı bir tema yayınlarsanız kodu o temanın{" "}
          <code>theme.liquid</code> dosyasına da yapıştırın.
        </li>
        <li>
          <strong>Siparişler.</strong> Apex sayfalarınızdan yanıt verir ve Shopify yönetim panelinize erişimi yoktur; bu
          yüzden sipariş sorgulayamaz. Sipariş sorularında ekibinize e-postayla devir önerebilir.
        </li>
        <li>
          <strong>Gizleme.</strong> Sohbetin belirli sayfalarda görünmemesi için yollarını{" "}
          <em>Davranış → Bu sayfalarda gizle</em> altına ekleyin.
        </li>
      </ul>
      <p>
        Sohbet düğmesi görünmüyorsa <a href="/tr/docs#troubleshooting">sorun giderme</a> bölümüne bakın.
      </p>
    </>
  );
}

export const shopify: MarketingContent = {
  meta: {
    title: "Shopify mağazanıza yapay zekâ chatbot ekleyin",
    description:
      "Yapay zekâ destek chatbotunu birkaç dakikada Shopify mağazanıza ekleyin: theme.liquid'e tek satır yapıştırın, kargo ve iade sorularını 7/24 yanıtlayın.",
    crumb: "Shopify",
  },
  eyebrow: "Shopify",
  title: "Shopify mağazanıza yapay zekâ chatbot nasıl eklenir?",
  intro:
    "Temanıza tek satır kod yapıştırın; Apex Bot alışverişçilerinizin sorularını kendi mağaza sayfalarınızdan Türkçe, İngilizce, Litvanca, Letonca ve Estonca yanıtlasın.",
  toc: TOC,
  body: Body,
};
