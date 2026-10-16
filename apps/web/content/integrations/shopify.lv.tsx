import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Pirms sākat" },
  { id: "install", label: "Pievienojiet to motīvam" },
  { id: "allow", label: "Atļaujiet veikala domēnus" },
  { id: "knowledge", label: "Ko tam sniegt" },
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
        Motīva koda rediģēšana ir droša, taču ieteicams vispirms izveidot motīva kopiju (<em>… → Duplicate</em>), lai būtu,
        pie kā atgriezties. Tālāk Shopify izvēlņu nosaukumi norādīti angliski; ja jūsu administrācijas saskarne ir citā
        valodā, meklējiet atbilstošos punktus tajā pašā vietā.
      </p>

      <h2 id="install">Pievienojiet to motīvam</h2>
      <ol>
        <li>
          Shopify administrācijas panelī atveriet <em>Online Store → Themes</em>.
        </li>
        <li>
          Blakus pašreizējam motīvam noklikšķiniet uz <em>…</em> un izvēlieties <em>Edit code</em>.
        </li>
        <li>
          Sadaļā <em>Layout</em> atveriet <code>theme.liquid</code>.
        </li>
        <li>
          Faila beigās atrodiet noslēdzošo <code>&lt;/body&gt;</code> tagu un ielīmējiet iegulšanas kodu tieši virs tā.
        </li>
        <li>
          Noklikšķiniet uz <em>Save</em> un atveriet veikalu jaunā cilnē. Tērzēšanas palaišanas poga parādīsies katrā lapā.
        </li>
      </ol>

      <h2 id="allow">Atļaujiet veikala domēnus</h2>
      <p>
        Sadaļā <em>Atļautās vietnes</em> pievienojiet visas adreses, kurās ir pieejams jūsu veikals: savu domēnu ar{" "}
        <code>www</code> un bez tā, kā arī adresi <code>jusu-veikals.myshopify.com</code>, ja to izmantojat jūs vai
        apmeklētāji. Logrīks darbojas tikai norādītajās adresēs.
      </p>

      <h2 id="knowledge">Ko tam sniegt</h2>
      <p>
        Pievienojiet sava veikala adresi kā zināšanu avotu. Apex izlasa vietnes karti un lapas, uz kurām tā norāda, līdz jūsu
        lapu limitam. Pārbaudiet, vai ir iekļauti piegādes, naudas atmaksas un maksājumu noteikumi, kā arī BUJ lapa; Shopify
        noteikumu lapas atrodas ceļā <code>/policies/</code>. To, kā veikalā vēl nav, pievienojiet kā teksta avotu. Vairāk
        ideju – lapā <a href="/lv/use-cases/e-commerce">Apex e-komercijai</a>.
      </p>

      <h2 id="notes">Der zināt</h2>
      <ul>
        <li>
          <strong>Norēķini.</strong> Shopify norēķinu lapās motīva kodu neielādē, tāpēc tērzēšana ir redzama veikala lapās,
          bet ne norēķinoties.
        </li>
        <li>
          <strong>Motīva maiņa.</strong> Koda fragments atrodas motīvā. Ja publicējat citu motīvu, ielīmējiet to arī šī motīva{" "}
          <code>theme.liquid</code> failā.
        </li>
        <li>
          <strong>Pasūtījumi.</strong> Apex atbild, balstoties uz jūsu lapām, un tam nav piekļuves Shopify administrācijai,
          tāpēc tas nevar atrast pasūtījumus. Jautājumos par pasūtījumiem tas var piedāvāt nodot sarunu jūsu komandai pa
          e-pastu.
        </li>
        <li>
          <strong>Paslēpšana.</strong> Lai tērzēšana netiktu rādīta noteiktās lapās, pievienojiet to ceļus sadaļā{" "}
          <em>Uzvedība → Slēpt šajās lapās</em>.
        </li>
      </ul>
      <p>
        Ja palaišanas poga neparādās, skatiet <a href="/lv/docs#troubleshooting">problēmu novēršanu</a>.
      </p>
    </>
  );
}

export const shopify: MarketingContent = {
  meta: {
    title: "Kā pievienot MI tērzēšanas robotu Shopify veikalam",
    description:
      "Dažu minūšu laikā pievienojiet Apex Bot MI klientu atbalsta tērzēšanas robotu savam Shopify veikalam: ielīmējiet vienu rindiņu theme.liquid failā un atbildiet uz piegādes un atgriešanas jautājumiem 24/7.",
    crumb: "Shopify",
  },
  eyebrow: "Shopify",
  title: "Kā pievienot MI tērzēšanas robotu savam Shopify veikalam",
  intro:
    "Ielīmējiet vienu koda rindiņu savā motīvā, un Apex Bot atbildēs uz pircēju jautājumiem, izmantojot jūsu veikala lapas, latviešu, lietuviešu, igauņu, angļu un turku valodā.",
  toc: TOC,
  body: Body,
};
