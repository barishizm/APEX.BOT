import { apiUrl, embedSnippet } from "@/lib/site";
import type { ProseContent } from "../types";

// Menu paths use the dashboard's Latvian labels (lib/i18n/app), so they match the screen
const TOC: ProseContent["toc"] = [
  { id: "setup", label: "Iestatīšanas ceļvedis" },
  { id: "knowledge", label: "Zināšanu bāze" },
  { id: "customize", label: "Pielāgošana" },
  { id: "install", label: "Logrīka uzstādīšana" },
  { id: "platforms", label: "Platformas" },
  { id: "javascript-api", label: "JavaScript API" },
  { id: "privacy", label: "Privātuma iestatījumi" },
  { id: "troubleshooting", label: "Problēmu novēršana" },
];

const API_EXAMPLE = `<script>
  // Neobligāti iestatījumi, kas tiek nolasīti, ielādējot logrīku
  window.Apex = {
    lang: "auto",                 // "auto", "tr", "en", "lt", "lv" vai "et"
    greeting: "Sveiki! Jautājiet jebko par mūsu veikalu.",
    suggestions: ["Piegādes termiņi", "Atgriešanas noteikumi"],
    theme: { primary: "#312c85", position: "bottom-right" },
  };
</script>`;

const METHODS_EXAMPLE = `Apex.open()                          // atver tērzēšanu
Apex.close()                         // aizver to
Apex.toggle()                        // atver vai aizver
Apex.send("Kur ir mans pasūtījums?") // atver un uzdod jautājumu
Apex.identify({ name: "Ada", email: "ada@example.com" })

Apex.on("message", (m) => console.log(m.text, m.sources))
Apex.on("open", () => analytics.track("chat_opened"))`;

function Body() {
  const snippet = embedSnippet("apex_pk_…");
  return (
    <>
      <h2 id="setup">Iestatīšanas ceļvedis</h2>
      <ol>
        <li>
          <strong>Izveidojiet kontu</strong> un apstipriniet savu e-pasta adresi. Jūsu darbvieta un asistents tiek izveidoti
          automātiski.
        </li>
        <li>
          <strong>Pievienojiet zināšanas.</strong> Norādiet Apex savas vietnes adresi, un tas izlasīs jūsu lapas. To, kā nav
          tiešsaistē, pievienojiet kā tekstu.
        </li>
        <li>
          <strong>Pielāgojiet logrīku</strong> sadaļā <em>Vadības panelis → Logrīks</em>: nosaukums, krāsas, sveiciens, tonis un
          modelis.
        </li>
        <li>
          <strong>Atļaujiet savu vietni</strong> sadaļā <em>Uzstādīšana un drošība</em>. Logrīks darbojas tikai tur norādītajās
          adresēs.
        </li>
        <li>
          <strong>Ielīmējiet iegulšanas kodu</strong> savā vietnē un atveriet to, lai izmēģinātu sarunu.
        </li>
      </ol>
      <p>
        Vadības paneļa <em>Iestatīšanas</em> saraksts seko šiem soļiem jūsu vietā.
      </p>

      <h2 id="knowledge">Zināšanu bāze</h2>
      <p>
        Apex atbild, izmantojot tikai tam sniegto saturu. Sadaļā <em>Vadības panelis → Zināšanu bāze</em> varat pievienot divu
        veidu avotus:
      </p>
      <ul>
        <li>
          <strong>Vietne.</strong> Apex izlasa jūsu ievadīto lapu, vietnes karti un lapas tajā pašā domēnā, uz kurām tās
          norāda, līdz lapu limitam. Tas ievēro <code>robots.txt</code> un izlaiž izvēlnes, kājenes un sīkdatņu joslas. Ikreiz,
          kad vietne mainās, sinhronizējiet to vēlreiz.
        </li>
        <li>
          <strong>Teksts.</strong> Ielīmējiet BUJ, noteikumus vai produktu informāciju, kuras nav jūsu vietnē. Katram tekstam
          piešķiriet skaidru nosaukumu – tas tiek rādīts kā avots atbildēm, kurās teksts izmantots.
        </li>
      </ul>
      <p>
        Ja nekas jūsu zināšanu bāzē pietiekami neatbilst jautājumam, asistents pasaka, ka nezina, nevis min, un, ja esat to
        ieslēguši, piedāvā nodot sarunu jūsu komandai. Cik precīzai jābūt atbilstībai, nosaka sadaļas <em>Personība</em>{" "}
        iestatījums <em>Atbildes pārliecība</em>.
      </p>

      <h2 id="customize">Pielāgošana</h2>
      <p>Katram iestatījumam logrīka studijā ir tiešais priekšskatījums. Svarīgākie no tiem:</p>
      <table>
        <thead>
          <tr>
            <th>Sadaļa</th>
            <th>Ko tā nosaka</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vispārīgi</td>
            <td>Robota vārdu un uzņēmuma nosaukumu, galvenes apakšvirsrakstu, noklusējuma un saskarnes valodu</td>
          </tr>
          <tr>
            <td>Izskats</td>
            <td>Zīmola krāsu, motīvu, palaišanas pogas ikonu, tekstu un novietojumu, loga platumu, stūru noapaļojumu un fontu</td>
          </tr>
          <tr>
            <td>Ziņas</td>
            <td>Sveicienu, ieteiktos jautājumus, atbildi “nezinu”, brīdinājumu un privātuma saiti</td>
          </tr>
          <tr>
            <td>Uzvedība</td>
            <td>Automātisku atvēršanu, uzaicinājuma burbuli, avotus, vērtējumus, cik ilgi atcerēties sarunas un kurās lapās slēpt</td>
          </tr>
          <tr>
            <td>MI modelis</td>
            <td>Pakalpojuma sniedzēju, modeli, radošumu, atbildes dziļumu, atbildes garumu, atmiņu un rezerves modeli</td>
          </tr>
          <tr>
            <td>Personība</td>
            <td>Toni, atbildes garumu, emocijzīmes, jūsu pašu norādījumus, tēmas, uz kurām neatbildēt, un atbildes pārliecību</td>
          </tr>
          <tr>
            <td>Nodošana un kontakti</td>
            <td>E-pasta adresi, kas saņem nodošanas pieprasījumus, un neobligātu kontaktu formu pirms sarunas</td>
          </tr>
        </tbody>
      </table>
      <p>Izmaiņas darbojošajā logrīkā parādās aptuveni minūtes laikā pēc saglabāšanas.</p>

      <h2 id="install">Logrīka uzstādīšana</h2>
      <p>
        Nokopējiet iegulšanas kodu no <em>Vadības panelis → Logrīks → Uzstādīšana un drošība</em>. Tajā jau ir ievadīta jūsu
        vietnes atslēga, un tas izskatās šādi:
      </p>
      <pre>
        <code>{snippet}</code>
      </pre>
      <p>
        Ielīmējiet to tieši pirms noslēdzošā <code>&lt;/body&gt;</code> taga katrā lapā, kurā jārāda tērzēšana. Pēc tam sadaļā{" "}
        <em>Atļautās vietnes</em> pievienojiet katru apmeklētāju izmantoto adresi, piemēram, <code>https://example.com</code>{" "}
        un <code>https://www.example.com</code>.
      </p>
      <p className="callout">
        Vietnes atslēga apzināti ir publiska: tā darbojas tikai jūsu atļautajās vietnēs. Ja to izmanto ļaunprātīgi, nomainiet to
        tajā pašā ekrānā un atjauniniet koda fragmentu savā vietnē.
      </p>

      <h2 id="platforms">Platformas</h2>
      <h3>WordPress</h3>
      <p>
        Izmantojiet galvenes un kājenes koda spraudni (piemēram, <em>WPCode</em>) un pievienojiet fragmentu visas vietnes kājenei
        vai ielīmējiet to motīva <code>footer.php</code> failā pirms <code>&lt;/body&gt;</code>.
      </p>
      <h3>Shopify</h3>
      <p>
        <em>Online Store → Themes → Edit code</em>, atveriet <code>layout/theme.liquid</code> un ielīmējiet fragmentu pirms{" "}
        <code>&lt;/body&gt;</code>.
      </p>
      <h3>Webflow, Wix un Squarespace</h3>
      <p>
        Pievienojiet to kā visas vietnes pielāgoto kodu kājenē: <em>Site settings → Custom code</em> (Webflow),{" "}
        <em>Settings → Custom code</em> (Wix) vai <em>Settings → Advanced → Code injection</em> (Squarespace).
      </p>
      <h3>React, Next.js un citas vienas lapas lietotnes</h3>
      <p>
        Ielādējiet skriptu vienreiz, piemēram, saknes izkārtojumā. Logrīks pats saglabā sarunu, mainoties lapām klienta pusē.
      </p>

      <h2 id="javascript-api">JavaScript API</h2>
      <p>
        Ja vēlaties, pirms skripta ielādes iestatiet <code>window.Apex</code>, lai konkrētā lapā mainītu dažus iestatījumus:
      </p>
      <pre>
        <code>{API_EXAMPLE}</code>
      </pre>
      <p>
        Pēc ielādes <code>window.Apex</code> ļauj vadīt logrīku ar jūsu pašu kodu. Izsaukumi, kas veikti pirms ielādes, tiek
        ievietoti rindā un izpildīti secīgi.
      </p>
      <pre>
        <code>{METHODS_EXAMPLE}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Notikums</th>
            <th>Kad tas notiek</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>open</code> / <code>close</code>
            </td>
            <td>Tērzēšanas logs tiek atvērts vai aizvērts</td>
          </tr>
          <tr>
            <td>
              <code>message</code>
            </td>
            <td>
              Atbildes straumēšana ir pabeigta; tiek saņemts <code>{"{ text, sources }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>lead</code>
            </td>
            <td>
              Apmeklētājs iesniedza kontaktu formu; tiek saņemts <code>{"{ email, name, phone }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>handoff</code>
            </td>
            <td>Apmeklētājs nosūtīja pieprasījumu “Runāt ar cilvēku”</td>
          </tr>
        </tbody>
      </table>

      <h2 id="privacy">Privātuma iestatījumi</h2>
      <ul>
        <li>
          Sarunas tiek automātiski dzēstas pēc glabāšanas perioda, ko iestatāt sadaļā <em>Uzstādīšana un drošība</em> (pēc
          noklusējuma – 30 dienas).
        </li>
        <li>
          Apmeklētāji jebkurā laikā var sākt jaunu sarunu, un vecā tiek notīrīta no viņu pārlūka. Jebkuru saglabāto sarunu varat
          dzēst lapā “Sarunas”.
        </li>
        <li>E-pasta adreses, tālruņu un karšu numuri mūsu žurnālos tiek maskēti.</li>
        <li>
          Pievienojiet privātuma politikas saiti sadaļā <em>Ziņas</em>, lai tā tiktu rādīta logrīka kājenē.
        </li>
      </ul>

      <h2 id="troubleshooting">Problēmu novēršana</h2>
      <h3>Palaišanas poga netiek rādīta</h3>
      <ul>
        <li>
          Pārbaudiet, vai lapas precīzā adrese (ieskaitot <code>www</code> un <code>https</code>) ir norādīta sadaļā{" "}
          <em>Atļautās vietnes</em>. Ja nav, pārlūka konsolē redzams ziņojums{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code>.
        </li>
        <li>
          Pārbaudiet, vai lapa neatrodas kādā no ceļiem sadaļā <em>Uzvedība → Slēpt šajās lapās</em>.
        </li>
        <li>
          Pārliecinieties, ka fragmenta <code>src</code> norāda uz <code>{apiUrl()}/widget.js</code> un vietnes atslēga
          sakrīt ar atslēgu jūsu vadības panelī. Pēc atslēgas maiņas vecais fragments pārstāj darboties.
        </li>
      </ul>
      <h3>Tas pārāk bieži saka “nezinu”</h3>
      <ul>
        <li>
          Pārbaudiet <em>Zināšanu bāzi</em>: vietnes avots, ko neizdevās nolasīt vai kurā atrasts maz lapu, parāda iemeslu.
        </li>
        <li>Pievienojiet trūkstošo informāciju kā teksta avotu.</li>
        <li>
          Nelielām zināšanu bāzēm iestatiet <em>Personība → Atbildes pārliecība</em> uz <em>Elastīga</em>.
        </li>
      </ul>
      <h3>Atbildes vairs nenāk</h3>
      <p>
        Iespējams, ir beidzies dienas tokenu budžets, kas iestatīts sadaļā <em>Uzstādīšana un drošība</em>; tādā gadījumā līdz
        pusnaktij pēc UTC tērzēšana piedāvā nodošanu cilvēkam. Varat arī pārbaudīt <a href="/lv/status">sistēmas statusa</a>{" "}
        lapu.
      </p>
    </>
  );
}

export const docs: ProseContent = {
  eyebrow: "Dokumentācija",
  title: "Apex Bot iestatīšana",
  intro: "Viss, kas nepieciešams no reģistrācijas līdz darbojošam asistentam jūsu vietnē. Lielākajai daļai vietņu tas aizņem mazāk nekā desmit minūtes.",
  toc: TOC,
  body: Body,
};
