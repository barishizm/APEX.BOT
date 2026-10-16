import { embedSnippet } from "@/lib/site";
import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "before", label: "Pirms sākat" },
  { id: "plugin", label: "1. iespēja: koda spraudnis" },
  { id: "theme", label: "2. iespēja: jūsu motīvs" },
  { id: "allow", label: "Atļaujiet savu domēnu" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "troubleshooting", label: "Problēmu novēršana" },
];

function Body() {
  return (
    <>
      <h2 id="before">Pirms sākat</h2>
      <p>
        Jums būs vajadzīgs iegulšanas kods no <em>Vadības panelis → Logrīks → Uzstādīšana un drošība</em>. Tajā jau ir
        ievadīta jūsu vietnes atslēga, un tas izskatās šādi:
      </p>
      <pre>
        <code>{embedSnippet("apex_pk_…")}</code>
      </pre>
      <p>
        Vispirms pievienojiet savu vietni kā zināšanu avotu, lai asistentam jau no pirmā brīža būtu, uz ko balstīt atbildes.
        WordPress.com vietnēs koda vai spraudņu pievienošanai vajadzīgs plāns, kas atļauj spraudņus; pašmitinātam WordPress
        šāda ierobežojuma nav.
      </p>
      <p>
        Tālāk WordPress izvēlņu nosaukumi norādīti angliski. Ja jūsu administrācijas saskarne ir citā valodā, meklējiet
        atbilstošos punktus tajā pašā vietā.
      </p>

      <h2 id="plugin">1. iespēja: koda spraudnis (ieteicams)</h2>
      <p>Galvenes un kājenes spraudnis pasargā koda fragmentu no motīva atjauninājumiem un darbojas ar jebkuru motīvu.</p>
      <ol>
        <li>
          WordPress administrācijas panelī atveriet <em>Plugins → Add New</em>, meklējiet <strong>WPCode</strong>, pēc tam
          instalējiet un aktivizējiet to.
        </li>
        <li>
          Atveriet <em>Code Snippets → Header &amp; Footer</em>.
        </li>
        <li>
          Ielīmējiet iegulšanas kodu laukā <strong>Footer</strong> un noklikšķiniet uz <em>Save Changes</em>.
        </li>
        <li>Atveriet savu vietni jaunā cilnē. Tērzēšanas palaišanas poga parādīsies jūsu izvēlētajā stūrī.</li>
      </ol>

      <h2 id="theme">2. iespēja: jūsu motīvs</h2>
      <p>
        Ja izmantojat klasisko motīvu, atveriet <em>Appearance → Theme File Editor</em>, atveriet <code>footer.php</code> un
        ielīmējiet fragmentu tieši pirms <code>&lt;/body&gt;</code>. Izmantojiet bērna (child) motīvu, citādi fragments
        pazudīs nākamajā motīva atjauninājumā. Bloku motīviem nav <code>footer.php</code> faila, tāpēc tajos izmantojiet
        spraudņa iespēju.
      </p>

      <h2 id="allow">Atļaujiet savu domēnu</h2>
      <p>
        Sadaļā <em>Atļautās vietnes</em> pievienojiet visas adreses, ko izmanto apmeklētāji, piemēram,{" "}
        <code>https://example.com</code> un <code>https://www.example.com</code>. Logrīks darbojas tikai norādītajās adresēs,
        tāpēc nokopēts fragments citā vietnē neko nedarīs.
      </p>

      <h2 id="woocommerce">WooCommerce</h2>
      <p>
        WooCommerce veikalos uzstādīšana notiek tāpat. Pārliecinieties, ka piegādes, atgriešanas un maksājumu lapas ir
        iekļautas zināšanu avotā, un to, kā tajās nav, pievienojiet kā teksta avotu. Lapā{" "}
        <a href="/lv/use-cases/e-commerce">Apex e-komercijai</a> uzzināsiet, kas labi darbojas veikalā.
      </p>

      <h2 id="troubleshooting">Problēmu novēršana</h2>
      <ul>
        <li>
          <strong>Palaišanas poga netiek rādīta.</strong> Atveriet pārlūka konsoli. Ziņojums{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code> nozīmē, ka precīzā adrese, ieskaitot <code>www</code> un{" "}
          <code>https</code>, nav norādīta sadaļā <em>Atļautās vietnes</em>.
        </li>
        <li>
          <strong>Darbojās, bet pārstāja pēc kešatmiņas spraudņa uzstādīšanas.</strong> Notīriet kešatmiņu. Ja izmantojat
          JavaScript “aizkavēšanas” vai “apvienošanas” funkcijas (WP Rocket, LiteSpeed Cache, Autoptimize un līdzīgas),
          izslēdziet no tām <code>widget.js</code>.
        </li>
        <li>
          <strong>Tiek rādīts lapās, kurās nevajadzētu.</strong> Pievienojiet šos ceļus sadaļā{" "}
          <em>Uzvedība → Slēpt šajās lapās</em>.
        </li>
      </ul>
      <p>
        Vairāk – <a href="/lv/docs#troubleshooting">dokumentācijā</a>.
      </p>
    </>
  );
}

export const wordpress: MarketingContent = {
  meta: {
    title: "Kā pievienot MI tērzēšanas robotu WordPress vietnei",
    description:
      "Dažu minūšu laikā pievienojiet Apex Bot MI klientu atbalsta tērzēšanas robotu jebkurai WordPress vai WooCommerce vietnei – ar koda spraudni vai motīvā. Detalizēts ceļvedis.",
    crumb: "WordPress",
  },
  eyebrow: "WordPress",
  title: "Kā pievienot MI tērzēšanas robotu savai WordPress vietnei",
  intro:
    "Apex Bot darbojas jebkurā WordPress vai WooCommerce vietnē. Ielīmējiet vienu koda rindiņu ar spraudni vai motīvā, un jūsu apmeklētāji saņems atbildes no jūsu pašu lapām.",
  toc: TOC,
  body: Body,
};
