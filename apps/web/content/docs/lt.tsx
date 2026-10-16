import { apiUrl, embedSnippet } from "@/lib/site";
import type { ProseContent } from "../types";

// Menu paths use the dashboard's Lithuanian labels (lib/i18n/app), so they match the screen
const TOC: ProseContent["toc"] = [
  { id: "setup", label: "Paruošimo vadovas" },
  { id: "knowledge", label: "Žinių bazė" },
  { id: "customize", label: "Pritaikymas" },
  { id: "install", label: "Valdiklio diegimas" },
  { id: "platforms", label: "Platformos" },
  { id: "javascript-api", label: "JavaScript API" },
  { id: "privacy", label: "Privatumo valdymas" },
  { id: "troubleshooting", label: "Trikčių šalinimas" },
];

const API_EXAMPLE = `<script>
  // Neprivalomi nustatymai, nuskaitomi įkeliant valdiklį
  window.Apex = {
    lang: "auto",                 // "auto", "tr", "en", "lt", "lv" arba "et"
    greeting: "Sveiki! Klauskite bet ko apie mūsų parduotuvę.",
    suggestions: ["Pristatymo terminai", "Grąžinimo taisyklės"],
    theme: { primary: "#312c85", position: "bottom-right" },
  };
</script>`;

const METHODS_EXAMPLE = `Apex.open()                          // atidaro pokalbį
Apex.close()                         // uždaro jį
Apex.toggle()                        // atidaro arba uždaro
Apex.send("Kur mano užsakymas?")     // atidaro ir užduoda klausimą
Apex.identify({ name: "Ada", email: "ada@example.com" })

Apex.on("message", (m) => console.log(m.text, m.sources))
Apex.on("open", () => analytics.track("chat_opened"))`;

function Body() {
  const snippet = embedSnippet("apex_pk_…");
  return (
    <>
      <h2 id="setup">Paruošimo vadovas</h2>
      <ol>
        <li>
          <strong>Susikurkite paskyrą</strong> ir patvirtinkite el. pašto adresą. Jūsų darbo sritis ir asistentas sukuriami
          automatiškai.
        </li>
        <li>
          <strong>Pridėkite žinių.</strong> Nurodykite Apex savo svetainės adresą, ir jis perskaitys jūsų puslapius. Tai, ko
          nėra internete, pridėkite kaip tekstą.
        </li>
        <li>
          <strong>Pritaikykite valdiklį</strong> skiltyje <em>Valdymo skydelis → Valdiklis</em>: pavadinimas, spalvos,
          pasisveikinimas, tonas ir modelis.
        </li>
        <li>
          <strong>Leiskite savo svetainę</strong> skiltyje <em>Diegimas ir saugumas</em>. Valdiklis veikia tik ten nurodytais
          adresais.
        </li>
        <li>
          <strong>Įklijuokite įterpimo kodą</strong> į savo svetainę ir ją atidarę išbandykite pokalbį.
        </li>
      </ol>
      <p>
        Valdymo skydelio <em>Paruošimo</em> sąrašas seka šiuos žingsnius už jus.
      </p>

      <h2 id="knowledge">Žinių bazė</h2>
      <p>
        Apex atsako tik remdamasis jam pateiktu turiniu. Skiltyje <em>Valdymo skydelis → Žinių bazė</em> galite pridėti dviejų
        rūšių šaltinius:
      </p>
      <ul>
        <li>
          <strong>Svetainė.</strong> Apex perskaito jūsų įvestą puslapį, svetainės žemėlapį ir puslapius tame pačiame domene,
          į kuriuos jie nukreipia, iki puslapių limito. Jis paiso <code>robots.txt</code> ir praleidžia meniu, poraštes bei
          slapukų juostas. Kaskart pasikeitus svetainei, sinchronizuokite ją iš naujo.
        </li>
        <li>
          <strong>Tekstas.</strong> Įklijuokite DUK, taisykles ar produktų informaciją, kurios nėra jūsų svetainėje. Kiekvienam
          tekstui suteikite aiškų pavadinimą – jis rodomas kaip atsakymų, kuriuose tekstas naudojamas, šaltinis.
        </li>
      </ul>
      <p>
        Kai niekas jūsų žinių bazėje pakankamai neatitinka klausimo, asistentas pasako, kad nežino, užuot spėliojęs, ir, jei
        įjungėte, pasiūlo perduoti pokalbį jūsų komandai. Kaip tiksliai turinys turi atitikti klausimą, nustato skilties{" "}
        <em>Asmenybė</em> nustatymas <em>Atsakymo užtikrintumas</em>.
      </p>

      <h2 id="customize">Pritaikymas</h2>
      <p>Kiekvienas nustatymas valdiklio studijoje turi tiesioginę peržiūrą. Svarbiausi iš jų:</p>
      <table>
        <thead>
          <tr>
            <th>Skiltis</th>
            <th>Ką ji valdo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Bendrieji</td>
            <td>Roboto vardą ir įmonės pavadinimą, antraštės paantraštę, numatytąją ir sąsajos kalbą</td>
          </tr>
          <tr>
            <td>Išvaizda</td>
            <td>Prekės ženklo spalvą, temą, paleidimo mygtuko piktogramą, užrašą ir padėtį, lango plotį, kampų spindulį ir šriftą</td>
          </tr>
          <tr>
            <td>Žinutės</td>
            <td>Pasisveikinimą, siūlomus klausimus, atsakymą „nežinau“, įspėjimą ir privatumo nuorodą</td>
          </tr>
          <tr>
            <td>Elgsena</td>
            <td>Automatinį atidarymą, kvietimo burbulą, šaltinius, vertinimus, kiek laiko prisimenami pokalbiai ir kuriuose puslapiuose slėpti</td>
          </tr>
          <tr>
            <td>DI modelis</td>
            <td>Paslaugų teikėją, modelį, kūrybiškumą, atsakymo gilumą, atsakymo ilgį, atmintį ir atsarginį modelį</td>
          </tr>
          <tr>
            <td>Asmenybė</td>
            <td>Toną, atsakymo ilgį, jaustukus, jūsų pačių instrukcijas, temas, į kurias neatsakoma, ir atsakymo užtikrintumą</td>
          </tr>
          <tr>
            <td>Perdavimas ir kontaktai</td>
            <td>El. pašto adresą, gaunantį perdavimus, ir neprivalomą kontaktų formą prieš pokalbį</td>
          </tr>
        </tbody>
      </table>
      <p>Pakeitimai veikiančiame valdiklyje atsiranda maždaug per minutę po išsaugojimo.</p>

      <h2 id="install">Valdiklio diegimas</h2>
      <p>
        Nukopijuokite įterpimo kodą iš <em>Valdymo skydelis → Valdiklis → Diegimas ir saugumas</em>. Jame jau įrašytas jūsų
        svetainės raktas, o jis atrodo taip:
      </p>
      <pre>
        <code>{snippet}</code>
      </pre>
      <p>
        Įklijuokite jį prieš pat uždarančiąją <code>&lt;/body&gt;</code> žymę kiekviename puslapyje, kuriame turi būti rodomas
        pokalbis. Tada skiltyje <em>Leidžiamos svetainės</em> pridėkite kiekvieną lankytojų naudojamą adresą, pavyzdžiui,{" "}
        <code>https://example.com</code> ir <code>https://www.example.com</code>.
      </p>
      <p className="callout">
        Svetainės raktas sąmoningai yra viešas: jis veikia tik jūsų leistose svetainėse. Jei juo piktnaudžiaujama, pakeiskite jį
        tame pačiame ekrane ir atnaujinkite kodo fragmentą savo svetainėje.
      </p>

      <h2 id="platforms">Platformos</h2>
      <h3>WordPress</h3>
      <p>
        Naudokite antraštės ir poraštės kodo įskiepį (pavyzdžiui, <em>WPCode</em>) ir pridėkite fragmentą į visos svetainės
        poraštę arba įklijuokite jį į temos <code>footer.php</code> prieš <code>&lt;/body&gt;</code>.
      </p>
      <h3>Shopify</h3>
      <p>
        <em>Online Store → Themes → Edit code</em>, atidarykite <code>layout/theme.liquid</code> ir įklijuokite fragmentą prieš{" "}
        <code>&lt;/body&gt;</code>.
      </p>
      <h3>Webflow, Wix ir Squarespace</h3>
      <p>
        Pridėkite jį kaip visos svetainės pasirinktinį kodą poraštėje: <em>Site settings → Custom code</em> (Webflow),{" "}
        <em>Settings → Custom code</em> (Wix) arba <em>Settings → Advanced → Code injection</em> (Squarespace).
      </p>
      <h3>React, Next.js ir kitos vieno puslapio programos</h3>
      <p>
        Įkelkite scenarijų vieną kartą, pavyzdžiui, pagrindiniame išdėstyme. Valdiklis pats išsaugo pokalbį keičiantis
        puslapiams kliento pusėje.
      </p>

      <h2 id="javascript-api">JavaScript API</h2>
      <p>
        Jei norite, prieš įkeliant scenarijų nustatykite <code>window.Apex</code> ir konkrečiame puslapyje pakeiskite kelis
        nustatymus:
      </p>
      <pre>
        <code>{API_EXAMPLE}</code>
      </pre>
      <p>
        Įkėlus valdiklį, <code>window.Apex</code> leidžia jį valdyti jūsų pačių kodu. Iškvietimai, atlikti prieš įkeliant, įtraukiami
        į eilę ir vykdomi iš eilės.
      </p>
      <pre>
        <code>{METHODS_EXAMPLE}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Įvykis</th>
            <th>Kada jis įvyksta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>open</code> / <code>close</code>
            </td>
            <td>Pokalbio langas atidaromas arba uždaromas</td>
          </tr>
          <tr>
            <td>
              <code>message</code>
            </td>
            <td>
              Atsakymas baigtas transliuoti; gaunama <code>{"{ text, sources }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>lead</code>
            </td>
            <td>
              Lankytojas pateikė kontaktų formą; gaunama <code>{"{ email, name, phone }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>handoff</code>
            </td>
            <td>Lankytojas išsiuntė prašymą „Kalbėti su žmogumi“</td>
          </tr>
        </tbody>
      </table>

      <h2 id="privacy">Privatumo valdymas</h2>
      <ul>
        <li>
          Pokalbiai automatiškai ištrinami praėjus saugojimo laikotarpiui, kurį nustatote skiltyje{" "}
          <em>Diegimas ir saugumas</em> (pagal numatytuosius nustatymus – 30 dienų).
        </li>
        <li>
          Lankytojai bet kada gali pradėti naują pokalbį – tada senasis ištrinamas iš jų naršyklės. Bet kurį išsaugotą pokalbį
          galite ištrinti puslapyje „Pokalbiai“.
        </li>
        <li>El. pašto adresai, telefono ir kortelių numeriai mūsų žurnaluose užmaskuojami.</li>
        <li>
          Pridėkite privatumo politikos nuorodą skiltyje <em>Žinutės</em>, kad ji būtų rodoma valdiklio poraštėje.
        </li>
      </ul>

      <h2 id="troubleshooting">Trikčių šalinimas</h2>
      <h3>Paleidimo mygtukas nerodomas</h3>
      <ul>
        <li>
          Patikrinkite, ar tikslus puslapio adresas (įskaitant <code>www</code> ir <code>https</code>) nurodytas skiltyje{" "}
          <em>Leidžiamos svetainės</em>. Jei ne, naršyklės konsolėje rodomas pranešimas{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code>.
        </li>
        <li>
          Patikrinkite, ar puslapis nepatenka į kurį nors kelią skiltyje <em>Elgsena → Slėpti šiuose puslapiuose</em>.
        </li>
        <li>
          Įsitikinkite, kad fragmento <code>src</code> nukreipia į <code>{apiUrl()}/widget.js</code>, o svetainės raktas sutampa
          su raktu jūsų valdymo skydelyje. Pakeitus raktą, senas fragmentas nustoja veikti.
        </li>
      </ul>
      <h3>Jis per dažnai sako „nežinau“</h3>
      <ul>
        <li>
          Patikrinkite <em>Žinių bazę</em>: svetainės šaltinis, kurio nepavyko perskaityti arba kuriame rasta mažai puslapių,
          parodo priežastį.
        </li>
        <li>Pridėkite trūkstamą informaciją kaip tekstinį šaltinį.</li>
        <li>
          Mažoms žinių bazėms nustatymą <em>Asmenybė → Atsakymo užtikrintumas</em> pakeiskite į <em>Lankstus</em>.
        </li>
      </ul>
      <h3>Atsakymai nebeateina</h3>
      <p>
        Galbūt baigėsi dienos žetonų biudžetas, nustatytas skiltyje <em>Diegimas ir saugumas</em>; tokiu atveju iki vidurnakčio
        pagal UTC pokalbis siūlo perdavimą žmogui. Taip pat galite patikrinti <a href="/lt/status">sistemos būsenos</a> puslapį.
      </p>
    </>
  );
}

export const docs: ProseContent = {
  eyebrow: "Dokumentacija",
  title: "Apex Bot paruošimas",
  intro: "Viskas, ko reikia nuo registracijos iki veikiančio asistento jūsų svetainėje. Daugumai svetainių tai užtrunka mažiau nei dešimt minučių.",
  toc: TOC,
  body: Body,
};
