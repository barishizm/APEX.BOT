import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Enne alustamist" },
  { id: "install", label: "Lisage see oma teemasse" },
  { id: "allow", label: "Lubage poe domeenid" },
  { id: "knowledge", label: "Mida sellele anda" },
  { id: "notes", label: "Hea teada" },
];

function Body() {
  return (
    <>
      <h2 id="before">Enne alustamist</h2>
      <p>
        Kopeerige manustamiskood jaotisest <em>Töölaud → Vidin → Paigaldamine ja turvalisus</em>. Sinna on juba sisestatud teie
        saidivõti ja see näeb välja selline:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Teema koodi muutmine on ohutu, kuid hea tava on teha esmalt teemast koopia (<em>… → Duplicate</em>), et oleks, mille
        juurde naasta. Allpool on Shopify menüüde nimed toodud inglise keeles; kui teie halduse liides on muus keeles, otsige
        vastavaid punkte samast kohast.
      </p>

      <h2 id="install">Lisage see oma teemasse</h2>
      <ol>
        <li>
          Avage Shopify halduses <em>Online Store → Themes</em>.
        </li>
        <li>
          Klõpsake praeguse teema kõrval nuppu <em>…</em> ja valige <em>Edit code</em>.
        </li>
        <li>
          Avage jaotises <em>Layout</em> fail <code>theme.liquid</code>.
        </li>
        <li>
          Leidke faili lõpust lõpetav silt <code>&lt;/body&gt;</code> ja kleepige manustamiskood vahetult selle kohale.
        </li>
        <li>
          Klõpsake <em>Save</em> ja avage oma pood uuel vahekaardil. Vestluse avamisnupp ilmub igale lehele.
        </li>
      </ol>

      <h2 id="allow">Lubage poe domeenid</h2>
      <p>
        Lisage jaotises <em>Lubatud veebisaidid</em> kõik aadressid, mille kaudu teie pood avaneb: oma domeen nii{" "}
        <code>www</code>-ga kui ka ilma ning aadress <code>teie-pood.myshopify.com</code>, kui teie või külastajad seda
        kasutavad. Vidin töötab ainult loetletud aadressidel.
      </p>

      <h2 id="knowledge">Mida sellele anda</h2>
      <p>
        Lisage oma poe aadress teadmusallikaks. Apex loeb saidikaardi ja lehed, millele see viitab, kuni teie lehtede
        piirmäärani. Kontrollige, et tarne-, raha tagastamise ja maksetingimused ning KKK leht oleksid kaasatud; Shopify
        tingimuste lehed asuvad teel <code>/policies/</code>. Lisage tekstiallikana kõik, mida teie poes veel pole. Rohkem
        ideid leiate lehelt <a href="/et/use-cases/e-commerce">Apex e-kaubandusele</a>.
      </p>

      <h2 id="notes">Hea teada</h2>
      <ul>
        <li>
          <strong>Kassa.</strong> Shopify ei laadi kassalehtedel teema koodi, seega on vestlus nähtav poe lehtedel, kuid
          mitte maksmise ajal.
        </li>
        <li>
          <strong>Teema vahetamine.</strong> Koodijupp asub teemas. Kui avaldate teise teema, kleepige see ka selle teema
          faili <code>theme.liquid</code>.
        </li>
        <li>
          <strong>Tellimused.</strong> Apex vastab teie lehtede põhjal ja tal puudub juurdepääs Shopify haldusele, seega ei
          saa see tellimusi otsida. Tellimuste küsimuste puhul saab see pakkuda vestluse üleandmist teie meeskonnale e-posti
          teel.
        </li>
        <li>
          <strong>Peitmine.</strong> Kui soovite vestluse teatud lehtedelt eemal hoida, lisage nende teed jaotisesse{" "}
          <em>Käitumine → Peida nendel lehtedel</em>.
        </li>
      </ul>
      <p>
        Kui avamisnuppu ei ilmu, vaadake <a href="/et/docs#troubleshooting">tõrkeotsingut</a>.
      </p>
    </>
  );
}

export const shopify: MarketingContent = {
  meta: {
    title: "TI vestlusroboti lisamine Shopify poodi",
    description:
      "Lisage Apex Boti TI klienditoe vestlusrobot mõne minutiga oma Shopify poodi: kleepige üks rida faili theme.liquid ja vastake tarne- ja tagastusküsimustele 24/7.",
    crumb: "Shopify",
  },
  eyebrow: "Shopify",
  title: "Kuidas lisada oma Shopify poodi TI vestlusrobot",
  intro:
    "Kleepige üks koodirida oma teemasse ja Apex Bot vastab ostjate küsimustele teie poe lehtede põhjal eesti, läti, leedu, inglise ja türgi keeles.",
  toc: TOC,
  body: Body,
};
