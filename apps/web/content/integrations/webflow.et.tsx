import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Enne alustamist" },
  { id: "site-wide", label: "Lisage see kõigile lehtedele" },
  { id: "single-page", label: "Või ühele lehele" },
  { id: "allow", label: "Lubage oma domeenid" },
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
        Webflow käivitab kohandatud koodi ainult tasulise saidipaketiga saitidel. Webflow' liides on ingliskeelne, seega on
        menüüde nimed allpool toodud inglise keeles.
      </p>

      <h2 id="site-wide">Lisage see kõigile lehtedele</h2>
      <ol>
        <li>
          Avage projekti <em>Site settings</em> ja minge vahekaardile <em>Custom code</em>.
        </li>
        <li>
          Kleepige manustamiskood väljale <strong>Footer code</strong> (koodi jaoks enne silti <code>&lt;/body&gt;</code>).
        </li>
        <li>
          Klõpsake <em>Save changes</em> ja seejärel <strong>avaldage</strong> oma sait. Kohandatud kood töötab ainult
          avaldatud saidil, mitte Designeris.
        </li>
      </ol>

      <h2 id="single-page">Või ühele lehele</h2>
      <p>
        Kui soovite vestlust näidata ainult ühel lehel, avage Designeris selle lehe seaded, kleepige koodijupp väljale{" "}
        <em>Custom code → Before &lt;/body&gt; tag</em> ja avaldage. Kui soovite seda näidata kõikjal peale mõne lehe, lisage
        see kogu saidile ja loetlege erandid oma Apexi töölaua jaotises <em>Käitumine → Peida nendel lehtedel</em>.
      </p>

      <h2 id="allow">Lubage oma domeenid</h2>
      <p>
        Lisage jaotises <em>Lubatud veebisaidid</em> oma domeen nii <code>www</code>-ga kui ka ilma. Kui soovite esmalt
        testida Webflow' testaadressil, lisage ka <code>https://teie-sait.webflow.io</code>. Vidin töötab ainult loetletud
        aadressidel.
      </p>

      <h2 id="notes">Hea teada</h2>
      <ul>
        <li>
          <strong>Teadmised.</strong> Lisage avaldatud sait teadmusallikaks. Apex loeb saidikaardi ja lingitud lehed, sealhulgas
          CMS-kogumike lehed, kuni teie lehtede piirmäärani. Pärast suurte muudatuste avaldamist sünkroonige uuesti.
        </li>
        <li>
          <strong>Kujundus.</strong> Vidin kuvatakse Shadow DOM-is, seega ei saa teie Webflow' stiilid seda lõhkuda. Värvid,
          avamisnupp ja asukoht määratakse Apexi töölaual.
        </li>
        <li>
          <strong>Avamine nupust.</strong> Andke nupule ID (näiteks <code>help</code>) ja lisage pärast manustamiskoodi{" "}
          <code>
            {`<script>document.getElementById("help").onclick = () => Apex.open()</script>`}
          </code>
          . Vaadake <a href="/et/docs#javascript-api">JavaScripti API-t</a>.
        </li>
      </ul>
      <p>
        Kui avamisnuppu ei ilmu, vaadake <a href="/et/docs#troubleshooting">tõrkeotsingut</a>.
      </p>
    </>
  );
}

export const webflow: MarketingContent = {
  meta: {
    title: "TI vestlusroboti lisamine Webflow' saidile",
    description:
      "Lisage Apex Boti TI klienditoe vestlusrobot mõne minutiga Webflow' saidile kogu saiti või ühte lehte hõlmava kohandatud koodiga. Vastused tulevad ainult teie enda lehtedelt.",
    crumb: "Webflow",
  },
  eyebrow: "Webflow",
  title: "Kuidas lisada oma Webflow' saidile TI vestlusrobot",
  intro:
    "Kleepige üks rida oma saidi kohandatud koodi, avaldage ja Apex Bot vastab teie külastajatele teie enda Webflow' lehtede põhjal.",
  toc: TOC,
  body: Body,
};
