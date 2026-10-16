import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Prieš pradedant" },
  { id: "install", label: "Pridėkite į savo temą" },
  { id: "allow", label: "Leiskite parduotuvės domenus" },
  { id: "knowledge", label: "Ką jam pateikti" },
  { id: "notes", label: "Verta žinoti" },
];

function Body() {
  return (
    <>
      <h2 id="before">Prieš pradedant</h2>
      <p>
        Nukopijuokite įterpimo kodą iš <em>Valdymo skydelis → Valdiklis → Diegimas ir saugumas</em>. Jame jau įrašytas jūsų
        svetainės raktas, o jis atrodo taip:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Temos kodo redagavimas saugus, tačiau verta pirmiausia sukurti temos kopiją (<em>… → Duplicate</em>), kad turėtumėte
        į ką sugrįžti. Toliau Shopify meniu pavadinimai pateikiami angliškai; jei jūsų administravimo sąsaja kita kalba,
        ieškokite atitinkamų punktų toje pačioje vietoje.
      </p>

      <h2 id="install">Pridėkite į savo temą</h2>
      <ol>
        <li>
          Shopify administravimo skydelyje eikite į <em>Online Store → Themes</em>.
        </li>
        <li>
          Šalia dabartinės temos spustelėkite <em>…</em> ir pasirinkite <em>Edit code</em>.
        </li>
        <li>
          Skiltyje <em>Layout</em> atidarykite <code>theme.liquid</code>.
        </li>
        <li>
          Failo pabaigoje suraskite uždarančiąją <code>&lt;/body&gt;</code> žymę ir įklijuokite įterpimo kodą iškart virš jos.
        </li>
        <li>
          Spustelėkite <em>Save</em> ir atidarykite parduotuvę naujame skirtuke. Pokalbio paleidimo mygtukas atsiras kiekviename
          puslapyje.
        </li>
      </ol>

      <h2 id="allow">Leiskite parduotuvės domenus</h2>
      <p>
        Skiltyje <em>Leidžiamos svetainės</em> pridėkite visus adresus, kuriais pasiekiama jūsų parduotuvė: savo domeną su{" "}
        <code>www</code> ir be jo, taip pat adresą <code>jusu-parduotuve.myshopify.com</code>, jei juo naudojasi lankytojai ar
        jūs. Valdiklis veikia tik nurodytais adresais.
      </p>

      <h2 id="knowledge">Ką jam pateikti</h2>
      <p>
        Pridėkite parduotuvės adresą kaip žinių šaltinį. Apex perskaito svetainės žemėlapį ir puslapius, į kuriuos jis
        nukreipia, iki jūsų puslapių limito. Patikrinkite, ar įtrauktos pristatymo, pinigų grąžinimo ir mokėjimo taisyklės bei
        DUK puslapis; Shopify taisyklių puslapiai yra kelyje <code>/policies/</code>. Tai, ko parduotuvėje dar nėra, pridėkite
        kaip tekstinį šaltinį. Daugiau idėjų – puslapyje <a href="/lt/use-cases/e-commerce">Apex elektroninei prekybai</a>.
      </p>

      <h2 id="notes">Verta žinoti</h2>
      <ul>
        <li>
          <strong>Atsiskaitymas.</strong> Shopify atsiskaitymo puslapiuose temos kodo neįkelia, todėl pokalbis rodomas
          parduotuvės puslapiuose, bet ne atsiskaitant.
        </li>
        <li>
          <strong>Temos keitimas.</strong> Kodo fragmentas yra temoje. Jei paskelbsite kitą temą, įklijuokite jį ir į tos
          temos <code>theme.liquid</code>.
        </li>
        <li>
          <strong>Užsakymai.</strong> Apex atsako remdamasis jūsų puslapiais ir neturi prieigos prie Shopify administravimo,
          todėl negali rasti užsakymų. Klausimų apie užsakymus atveju jis gali pasiūlyti perduoti pokalbį jūsų komandai
          el. paštu.
        </li>
        <li>
          <strong>Paslėpimas.</strong> Jei nenorite, kad pokalbis būtų rodomas tam tikruose puslapiuose, pridėkite jų kelius
          skiltyje <em>Elgsena → Slėpti šiuose puslapiuose</em>.
        </li>
      </ul>
      <p>
        Jei paleidimo mygtukas neatsiranda, žr. <a href="/lt/docs#troubleshooting">trikčių šalinimą</a>.
      </p>
    </>
  );
}

export const shopify: MarketingContent = {
  meta: {
    title: "Kaip pridėti DI pokalbių robotą į Shopify parduotuvę",
    description:
      "Per kelias minutes pridėkite Apex Bot DI klientų aptarnavimo pokalbių robotą į Shopify parduotuvę: įklijuokite vieną eilutę į theme.liquid ir atsakykite į pristatymo bei grąžinimo klausimus 24/7.",
    crumb: "Shopify",
  },
  eyebrow: "Shopify",
  title: "Kaip pridėti DI pokalbių robotą į savo Shopify parduotuvę",
  intro:
    "Įklijuokite vieną kodo eilutę į savo temą, ir Apex Bot atsakys į pirkėjų klausimus remdamasis jūsų parduotuvės puslapiais – lietuvių, latvių, estų, anglų ir turkų kalbomis.",
  toc: TOC,
  body: Body,
};
