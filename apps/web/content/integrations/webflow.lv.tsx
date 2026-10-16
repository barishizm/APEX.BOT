import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Pirms sākat" },
  { id: "site-wide", label: "Pievienojiet visām lapām" },
  { id: "single-page", label: "Vai vienai lapai" },
  { id: "allow", label: "Atļaujiet savus domēnus" },
  { id: "notes", label: "Der zināt" },
];

function Body() {
  return (
    <>
      <h2 id="before">Pirms sākat</h2>
      <p>
        Nokopējiet iegulšanas kodu no <em>Vadības panelis → Logrīks → Uzstādīšana un drošība</em>. Tajā jau ir ievadīta jūsu
        vietnes atslēga, un tas izskatās šādi:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Webflow pielāgoto kodu izpilda tikai vietnēs ar maksas vietnes plānu. Webflow saskarne ir angļu valodā, tāpēc tālāk
        izvēlņu nosaukumi norādīti angliski.
      </p>

      <h2 id="site-wide">Pievienojiet visām lapām</h2>
      <ol>
        <li>
          Atveriet projekta <em>Site settings</em> un pārejiet uz cilni <em>Custom code</em>.
        </li>
        <li>
          Ielīmējiet iegulšanas kodu laukā <strong>Footer code</strong> (kodam pirms <code>&lt;/body&gt;</code> taga).
        </li>
        <li>
          Noklikšķiniet uz <em>Save changes</em>, pēc tam <strong>publicējiet</strong> vietni. Pielāgotais kods darbojas tikai
          publicētajā vietnē, nevis Designer vidē.
        </li>
      </ol>

      <h2 id="single-page">Vai vienai lapai</h2>
      <p>
        Lai tērzēšanu rādītu tikai vienā lapā, atveriet šīs lapas iestatījumus Designer vidē, ielīmējiet fragmentu laukā{" "}
        <em>Custom code → Before &lt;/body&gt; tag</em> un publicējiet. Lai to rādītu visur, izņemot dažas lapas, pievienojiet
        to visai vietnei un uzskaitiet izņēmumus Apex vadības paneļa sadaļā <em>Uzvedība → Slēpt šajās lapās</em>.
      </p>

      <h2 id="allow">Atļaujiet savus domēnus</h2>
      <p>
        Sadaļā <em>Atļautās vietnes</em> pievienojiet savu domēnu ar <code>www</code> un bez tā. Ja vēlaties vispirms
        izmēģināt Webflow testa adresē, pievienojiet arī <code>https://jusu-vietne.webflow.io</code>. Logrīks darbojas tikai
        norādītajās adresēs.
      </p>

      <h2 id="notes">Der zināt</h2>
      <ul>
        <li>
          <strong>Zināšanas.</strong> Pievienojiet publicēto vietni kā zināšanu avotu. Apex izlasa vietnes karti un saistītās
          lapas, ieskaitot CMS kolekciju lapas, līdz jūsu lapu limitam. Pēc lielu izmaiņu publicēšanas sinhronizējiet vēlreiz.
        </li>
        <li>
          <strong>Stils.</strong> Logrīks tiek attēlots Shadow DOM vidē, tāpēc jūsu Webflow stili to nevar sabojāt. Krāsas,
          palaišanas poga un novietojums tiek iestatīti Apex vadības panelī.
        </li>
        <li>
          <strong>Atvēršana ar pogu.</strong> Piešķiriet pogai ID (piemēram, <code>help</code>) un pēc iegulšanas koda
          pievienojiet{" "}
          <code>
            {`<script>document.getElementById("help").onclick = () => Apex.open()</script>`}
          </code>
          . Skatiet <a href="/lv/docs#javascript-api">JavaScript API</a>.
        </li>
      </ul>
      <p>
        Ja palaišanas poga neparādās, skatiet <a href="/lv/docs#troubleshooting">problēmu novēršanu</a>.
      </p>
    </>
  );
}

export const webflow: MarketingContent = {
  meta: {
    title: "Kā pievienot MI tērzēšanas robotu Webflow vietnei",
    description:
      "Dažu minūšu laikā pievienojiet Apex Bot MI klientu atbalsta tērzēšanas robotu Webflow vietnei ar pielāgotu kodu visai vietnei vai vienai lapai. Atbildes nāk tikai no jūsu lapām.",
    crumb: "Webflow",
  },
  eyebrow: "Webflow",
  title: "Kā pievienot MI tērzēšanas robotu savai Webflow vietnei",
  intro:
    "Ielīmējiet vienu rindiņu vietnes pielāgotajā kodā, publicējiet, un Apex Bot atbildēs jūsu apmeklētājiem, izmantojot jūsu pašu Webflow lapas.",
  toc: TOC,
  body: Body,
};
