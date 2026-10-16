import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Prieš pradedant" },
  { id: "plugin", label: "1 būdas: kodo įskiepis" },
  { id: "theme", label: "2 būdas: jūsų tema" },
  { id: "allow", label: "Leiskite savo domeną" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "troubleshooting", label: "Trikčių šalinimas" },
];

function Body() {
  return (
    <>
      <h2 id="before">Prieš pradedant</h2>
      <p>
        Jums reikės įterpimo kodo iš <em>Valdymo skydelis → Valdiklis → Diegimas ir saugumas</em>. Jame jau įrašytas jūsų
        svetainės raktas, o jis atrodo taip:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Pirmiausia pridėkite savo svetainę kaip žinių šaltinį, kad asistentas turėtų kuo remtis vos tik pasirodęs.
        WordPress.com svetainėse kodui ar įskiepiams pridėti reikia plano, leidžiančio naudoti įskiepius; savarankiškai talpinamas
        WordPress tokio apribojimo neturi.
      </p>
      <p>
        Toliau WordPress meniu pavadinimai pateikiami angliškai. Jei jūsų administravimo sąsaja kita kalba, ieškokite
        atitinkamų punktų toje pačioje vietoje.
      </p>

      <h2 id="plugin">1 būdas: kodo įskiepis (rekomenduojama)</h2>
      <p>Antraštės ir poraštės įskiepis apsaugo kodo fragmentą nuo temos atnaujinimų ir veikia su bet kuria tema.</p>
      <ol>
        <li>
          WordPress administravimo skydelyje eikite į <em>Plugins → Add New</em>, susiraskite <strong>WPCode</strong>, tada
          jį įdiekite ir aktyvuokite.
        </li>
        <li>
          Atidarykite <em>Code Snippets → Header &amp; Footer</em>.
        </li>
        <li>
          Įklijuokite įterpimo kodą į laukelį <strong>Footer</strong> ir spustelėkite <em>Save Changes</em>.
        </li>
        <li>Atidarykite savo svetainę naujame skirtuke. Pokalbio paleidimo mygtukas atsiras jūsų pasirinktame kampe.</li>
      </ol>

      <h2 id="theme">2 būdas: jūsų tema</h2>
      <p>
        Jei naudojate klasikinę temą, eikite į <em>Appearance → Theme File Editor</em>, atidarykite <code>footer.php</code>{" "}
        ir įklijuokite kodo fragmentą prieš pat <code>&lt;/body&gt;</code>. Naudokite antrinę (child) temą, nes kitaip
        fragmentas išnyks kitą kartą atnaujinus temą. Blokų temos neturi <code>footer.php</code> failo, todėl jose naudokite
        įskiepio būdą.
      </p>

      <h2 id="allow">Leiskite savo domeną</h2>
      <p>
        Skiltyje <em>Leidžiamos svetainės</em> pridėkite visus lankytojų naudojamus adresus, pavyzdžiui,{" "}
        <code>https://example.com</code> ir <code>https://www.example.com</code>. Valdiklis veikia tik nurodytais adresais,
        todėl nukopijuotas kodo fragmentas kito asmens svetainėje nieko nedarys.
      </p>

      <h2 id="woocommerce">WooCommerce</h2>
      <p>
        WooCommerce parduotuvėse diegiama taip pat. Įsitikinkite, kad pristatymo, grąžinimo ir mokėjimo puslapiai įtraukti į
        žinių šaltinį, o tai, ko juose nėra, pridėkite kaip tekstinį šaltinį. Puslapyje{" "}
        <a href="/lt/use-cases/e-commerce">Apex elektroninei prekybai</a> rasite, kas gerai veikia parduotuvėse.
      </p>

      <h2 id="troubleshooting">Trikčių šalinimas</h2>
      <ul>
        <li>
          <strong>Paleidimo mygtukas nerodomas.</strong> Atidarykite naršyklės konsolę. Pranešimas{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code> reiškia, kad tikslaus adreso, įskaitant <code>www</code> ir{" "}
          <code>https</code>, nėra skiltyje <em>Leidžiamos svetainės</em>.
        </li>
        <li>
          <strong>Veikė, bet nustojo įdiegus podėlio įskiepį.</strong> Išvalykite podėlį. Jei naudojate JavaScript
          „atidėjimo“ ar „sujungimo“ funkcijas (WP Rocket, LiteSpeed Cache, Autoptimize ir panašius), neįtraukite į jas{" "}
          <code>widget.js</code>.
        </li>
        <li>
          <strong>Rodomas puslapiuose, kuriuose neturėtų.</strong> Pridėkite tuos kelius skiltyje{" "}
          <em>Elgsena → Slėpti šiuose puslapiuose</em>.
        </li>
      </ul>
      <p>
        Daugiau – <a href="/lt/docs#troubleshooting">dokumentacijoje</a>.
      </p>
    </>
  );
}

export const wordpress: MarketingContent = {
  meta: {
    title: "Kaip pridėti DI pokalbių robotą į WordPress",
    description:
      "Per kelias minutes pridėkite Apex Bot DI klientų aptarnavimo pokalbių robotą į bet kurią WordPress ar WooCommerce svetainę – kodo įskiepiu arba per temą. Išsamus vadovas.",
    crumb: "WordPress",
  },
  eyebrow: "WordPress",
  title: "Kaip pridėti DI pokalbių robotą į savo WordPress svetainę",
  intro:
    "Apex Bot veikia bet kurioje WordPress ar WooCommerce svetainėje. Įklijuokite vieną kodo eilutę įskiepiu arba temoje, ir jūsų lankytojai gaus atsakymus iš jūsų pačių puslapių.",
  toc: TOC,
  body: Body,
};
