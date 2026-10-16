import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Enne alustamist" },
  { id: "plugin", label: "1. võimalus: koodiplugin" },
  { id: "theme", label: "2. võimalus: teie teema" },
  { id: "allow", label: "Lubage oma domeen" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "troubleshooting", label: "Tõrkeotsing" },
];

function Body() {
  return (
    <>
      <h2 id="before">Enne alustamist</h2>
      <p>
        Teil on vaja manustamiskoodi jaotisest <em>Töölaud → Vidin → Paigaldamine ja turvalisus</em>. Sinna on juba sisestatud
        teie saidivõti ja see näeb välja selline:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Kõigepealt lisage oma veebisait teadmusallikaks, et assistendil oleks kohe esimesest hetkest, millele vastustes
        tugineda. WordPress.com-is on koodi või pluginate lisamiseks vaja paketti, mis pluginaid lubab; ise majutatud
        WordPressil sellist piirangut pole.
      </p>
      <p>
        Allpool on WordPressi menüüde nimed toodud inglise keeles. Kui teie halduse liides on muus keeles, otsige vastavaid
        punkte samast kohast.
      </p>

      <h2 id="plugin">1. võimalus: koodiplugin (soovitatav)</h2>
      <p>Päise ja jaluse plugin kaitseb koodijuppi teema uuenduste eest ja töötab iga teemaga.</p>
      <ol>
        <li>
          Avage WordPressi halduses <em>Plugins → Add New</em>, otsige <strong>WPCode</strong>, seejärel paigaldage ja
          aktiveerige see.
        </li>
        <li>
          Avage <em>Code Snippets → Header &amp; Footer</em>.
        </li>
        <li>
          Kleepige manustamiskood väljale <strong>Footer</strong> ja klõpsake <em>Save Changes</em>.
        </li>
        <li>Avage oma sait uuel vahekaardil. Vestluse avamisnupp ilmub teie valitud nurka.</li>
      </ol>

      <h2 id="theme">2. võimalus: teie teema</h2>
      <p>
        Klassikalise teema puhul avage <em>Appearance → Theme File Editor</em>, avage fail <code>footer.php</code> ja kleepige
        koodijupp vahetult enne silti <code>&lt;/body&gt;</code>. Kasutage alamteemat (child theme), muidu kaob koodijupp
        teema järgmisel uuendamisel. Plokiteemadel pole faili <code>footer.php</code>, seega kasutage nende puhul pluginat.
      </p>

      <h2 id="allow">Lubage oma domeen</h2>
      <p>
        Lisage jaotises <em>Lubatud veebisaidid</em> kõik külastajate kasutatavad aadressid, näiteks{" "}
        <code>https://example.com</code> ja <code>https://www.example.com</code>. Vidin töötab ainult loetletud aadressidel,
        seega ei tee kopeeritud koodijupp kellegi teise saidil midagi.
      </p>

      <h2 id="woocommerce">WooCommerce</h2>
      <p>
        WooCommerce'i poodides käib paigaldamine samamoodi. Veenduge, et tarne-, tagastus- ja maksetingimuste lehed on
        teadmusallika osa, ning lisage tekstiallikana kõik, mida need ei käsitle. Lehelt{" "}
        <a href="/et/use-cases/e-commerce">Apex e-kaubandusele</a> leiate, mis poes hästi toimib.
      </p>

      <h2 id="troubleshooting">Tõrkeotsing</h2>
      <ul>
        <li>
          <strong>Avamisnuppu ei kuvata.</strong> Avage brauseri konsool. Teade{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code> tähendab, et täpne aadress koos <code>www</code> ja{" "}
          <code>https</code> osaga puudub jaotisest <em>Lubatud veebisaidid</em>.
        </li>
        <li>
          <strong>See töötas, kuid lakkas pärast vahemälupluginat.</strong> Tühjendage vahemälu. Kui kasutate JavaScripti
          „viivitamise“ või „ühendamise“ funktsioone (WP Rocket, LiteSpeed Cache, Autoptimize jms), jätke{" "}
          <code>widget.js</code> neist välja.
        </li>
        <li>
          <strong>See kuvatakse lehtedel, kus ei peaks.</strong> Lisage need teed jaotisesse{" "}
          <em>Käitumine → Peida nendel lehtedel</em>.
        </li>
      </ul>
      <p>
        Lisateavet leiate <a href="/et/docs#troubleshooting">dokumentatsioonist</a>.
      </p>
    </>
  );
}

export const wordpress: MarketingContent = {
  meta: {
    title: "TI vestlusroboti lisamine WordPressi",
    description:
      "Lisage Apex Boti TI klienditoe vestlusrobot mõne minutiga mis tahes WordPressi või WooCommerce'i saidile – koodipluginaga või teema kaudu. Samm-sammult juhend.",
    crumb: "WordPress",
  },
  eyebrow: "WordPress",
  title: "Kuidas lisada oma WordPressi saidile TI vestlusrobot",
  intro:
    "Apex Bot töötab igal WordPressi või WooCommerce'i saidil. Kleepige üks koodirida pluginaga või teemasse ja teie külastajad saavad vastused teie enda lehtedelt.",
  toc: TOC,
  body: Body,
};
