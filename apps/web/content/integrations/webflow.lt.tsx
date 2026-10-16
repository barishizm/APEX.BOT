import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Prieš pradedant" },
  { id: "site-wide", label: "Pridėkite į visus puslapius" },
  { id: "single-page", label: "Arba į vieną puslapį" },
  { id: "allow", label: "Leiskite savo domenus" },
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
        Webflow pasirinktinį kodą vykdo tik svetainėse su mokamu svetainės planu. Webflow sąsaja yra anglų kalba, todėl meniu
        pavadinimai toliau pateikiami angliškai.
      </p>

      <h2 id="site-wide">Pridėkite į visus puslapius</h2>
      <ol>
        <li>
          Atidarykite projekto <em>Site settings</em> ir eikite į skirtuką <em>Custom code</em>.
        </li>
        <li>
          Įklijuokite įterpimo kodą į laukelį <strong>Footer code</strong> (kodui prieš <code>&lt;/body&gt;</code> žymę).
        </li>
        <li>
          Spustelėkite <em>Save changes</em>, tada <strong>paskelbkite</strong> svetainę. Pasirinktinis kodas veikia tik
          paskelbtoje svetainėje, o ne Designer aplinkoje.
        </li>
      </ol>

      <h2 id="single-page">Arba į vieną puslapį</h2>
      <p>
        Jei pokalbį norite rodyti tik viename puslapyje, Designer aplinkoje atidarykite to puslapio nustatymus, įklijuokite
        fragmentą į <em>Custom code → Before &lt;/body&gt; tag</em> ir paskelbkite. Jei norite jį rodyti visur, išskyrus kelis
        puslapius, pridėkite jį visai svetainei, o išimtis išvardykite savo Apex valdymo skydelio skiltyje{" "}
        <em>Elgsena → Slėpti šiuose puslapiuose</em>.
      </p>

      <h2 id="allow">Leiskite savo domenus</h2>
      <p>
        Skiltyje <em>Leidžiamos svetainės</em> pridėkite savo domeną su <code>www</code> ir be jo. Jei pirmiausia norite
        išbandyti Webflow bandomuoju adresu, pridėkite ir <code>https://jusu-svetaine.webflow.io</code>. Valdiklis veikia tik
        nurodytais adresais.
      </p>

      <h2 id="notes">Verta žinoti</h2>
      <ul>
        <li>
          <strong>Žinios.</strong> Pridėkite paskelbtą svetainę kaip žinių šaltinį. Apex perskaito svetainės žemėlapį ir
          susietus puslapius, įskaitant CMS kolekcijų puslapius, iki jūsų puslapių limito. Paskelbę didelių pakeitimų,
          sinchronizuokite iš naujo.
        </li>
        <li>
          <strong>Stilius.</strong> Valdiklis atvaizduojamas Shadow DOM aplinkoje, todėl jūsų Webflow stiliai jo sugadinti
          negali. Spalvos, paleidimo mygtukas ir padėtis nustatomi Apex valdymo skydelyje.
        </li>
        <li>
          <strong>Atidarymas mygtuku.</strong> Suteikite mygtukui ID (pavyzdžiui, <code>help</code>) ir po įterpimo kodo
          pridėkite{" "}
          <code>
            {`<script>document.getElementById("help").onclick = () => Apex.open()</script>`}
          </code>
          . Žr. <a href="/lt/docs#javascript-api">JavaScript API</a>.
        </li>
      </ul>
      <p>
        Jei paleidimo mygtukas neatsiranda, žr. <a href="/lt/docs#troubleshooting">trikčių šalinimą</a>.
      </p>
    </>
  );
}

export const webflow: MarketingContent = {
  meta: {
    title: "Kaip pridėti DI pokalbių robotą į Webflow svetainę",
    description:
      "Per kelias minutes pridėkite Apex Bot DI klientų aptarnavimo pokalbių robotą į Webflow svetainę – pasirinktiniu kodu visai svetainei arba vienam puslapiui. Atsakymai pateikiami tik iš jūsų puslapių.",
    crumb: "Webflow",
  },
  eyebrow: "Webflow",
  title: "Kaip pridėti DI pokalbių robotą į savo Webflow svetainę",
  intro:
    "Įklijuokite vieną eilutę į svetainės pasirinktinį kodą, paskelbkite, ir Apex Bot atsakys jūsų lankytojams remdamasis jūsų pačių Webflow puslapiais.",
  toc: TOC,
  body: Body,
};
