import { apiUrl, embedSnippet } from "@/lib/site";
import type { ProseContent } from "../types";

// Menu paths use the dashboard's Estonian labels (lib/i18n/app), so they match the screen
const TOC: ProseContent["toc"] = [
  { id: "setup", label: "Seadistusjuhend" },
  { id: "knowledge", label: "Teadmusbaas" },
  { id: "customize", label: "Kohandamine" },
  { id: "install", label: "Vidina paigaldamine" },
  { id: "platforms", label: "Platvormid" },
  { id: "javascript-api", label: "JavaScripti API" },
  { id: "privacy", label: "Privaatsusseaded" },
  { id: "troubleshooting", label: "Tõrkeotsing" },
];

const API_EXAMPLE = `<script>
  // Valikulised seaded, mida loetakse vidina laadimisel
  window.Apex = {
    lang: "auto",                 // "auto", "tr", "en", "lt", "lv" või "et"
    greeting: "Tere! Küsige meie poe kohta mida iganes.",
    suggestions: ["Tarneajad", "Tagastustingimused"],
    theme: { primary: "#312c85", position: "bottom-right" },
  };
</script>`;

const METHODS_EXAMPLE = `Apex.open()                          // avab vestluse
Apex.close()                         // sulgeb selle
Apex.toggle()                        // avab või sulgeb
Apex.send("Kus minu tellimus on?")   // avab ja esitab küsimuse
Apex.identify({ name: "Ada", email: "ada@example.com" })

Apex.on("message", (m) => console.log(m.text, m.sources))
Apex.on("open", () => analytics.track("chat_opened"))`;

function Body() {
  const snippet = embedSnippet("apex_pk_…");
  return (
    <>
      <h2 id="setup">Seadistusjuhend</h2>
      <ol>
        <li>
          <strong>Looge konto</strong> ja kinnitage oma e-posti aadress. Teie tööruum ja assistent luuakse automaatselt.
        </li>
        <li>
          <strong>Lisage teadmisi.</strong> Andke Apexile oma veebisaidi aadress ja see loeb teie lehed läbi. Lisage tekstina
          kõik, mida veebis pole.
        </li>
        <li>
          <strong>Kohandage vidinat</strong> jaotises <em>Töölaud → Vidin</em>: nimi, värvid, tervitus, toon ja mudel.
        </li>
        <li>
          <strong>Lubage oma veebisait</strong> jaotises <em>Paigaldamine ja turvalisus</em>. Vidin töötab ainult seal
          loetletud aadressidel.
        </li>
        <li>
          <strong>Kleepige manustamiskood</strong> oma saidile ja avage see, et vestlust proovida.
        </li>
      </ol>
      <p>
        Töölaua <em>Seadistamise</em> kontrollnimekiri jälgib neid samme teie eest.
      </p>

      <h2 id="knowledge">Teadmusbaas</h2>
      <p>
        Apex vastab ainult talle antud sisu põhjal. Jaotises <em>Töölaud → Teadmusbaas</em> saate lisada kahte liiki allikaid:
      </p>
      <ul>
        <li>
          <strong>Veebisait.</strong> Apex loeb teie sisestatud lehe, saidikaardi ja samas domeenis olevad lehed, millele need
          viitavad, kuni lehtede piirmäärani. See järgib faili <code>robots.txt</code> ning jätab vahele menüüd, jalused ja
          küpsiseribad. Sünkroonige see uuesti alati, kui teie sait muutub.
        </li>
        <li>
          <strong>Tekst.</strong> Kleepige KKK, tingimused või tooteandmed, mida teie veebisaidil pole. Andke igaühele selge
          pealkiri – seda näidatakse allikana vastustes, mis seda kasutavad.
        </li>
      </ul>
      <p>
        Kui miski teie teadmusbaasis ei vasta küsimusele piisavalt hästi, ütleb assistent arvamise asemel, et ei tea, ja
        pakub, kui olete selle sisse lülitanud, vestluse üleandmist teie meeskonnale. Kui täpne peab vaste olema, määrab
        jaotise <em>Isikupära</em> seade <em>Vastuse kindlus</em>.
      </p>

      <h2 id="customize">Kohandamine</h2>
      <p>Igal seadel on vidinastuudios reaalajas eelvaade. Kõige olulisemad neist:</p>
      <table>
        <thead>
          <tr>
            <th>Jaotis</th>
            <th>Mida see määrab</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Üldine</td>
            <td>Roboti ja ettevõtte nime, päise alapealkirja, vaikekeele ja liidese keele</td>
          </tr>
          <tr>
            <td>Välimus</td>
            <td>Brändi värvi, teema, avamisnupu ikooni, teksti ja asukoha, akna laiuse, nurkade raadiuse ja fondi</td>
          </tr>
          <tr>
            <td>Sõnumid</td>
            <td>Tervituse, soovitatud küsimused, vastuse „ma ei tea“, hoiatuse ja privaatsuslingi</td>
          </tr>
          <tr>
            <td>Käitumine</td>
            <td>Automaatse avamise, kutsemulli, allikad, hinnangud, kui kaua vestlusi meeles peetakse ja millistel lehtedel peita</td>
          </tr>
          <tr>
            <td>TI mudel</td>
            <td>Teenusepakkuja, mudeli, loovuse, vastuse sügavuse, vastuse pikkuse, mälu ja varumudeli</td>
          </tr>
          <tr>
            <td>Isikupära</td>
            <td>Tooni, vastuse pikkuse, emotikonid, teie enda juhised, teemad, millest keelduda, ja vastuse kindluse</td>
          </tr>
          <tr>
            <td>Üleandmine ja kontaktid</td>
            <td>E-posti aadressi, kuhu üleandmised saadetakse, ja valikulise kontaktivormi enne vestlust</td>
          </tr>
        </tbody>
      </table>
      <p>Muudatused jõuavad töötavasse vidinasse umbes minuti jooksul pärast salvestamist.</p>

      <h2 id="install">Vidina paigaldamine</h2>
      <p>
        Kopeerige manustamiskood jaotisest <em>Töölaud → Vidin → Paigaldamine ja turvalisus</em>. Sinna on juba sisestatud teie
        saidivõti ja see näeb välja selline:
      </p>
      <pre>
        <code>{snippet}</code>
      </pre>
      <p>
        Kleepige see vahetult enne lõpetavat silti <code>&lt;/body&gt;</code> igal lehel, kus vestlus peab olema nähtav.
        Seejärel lisage jaotises <em>Lubatud veebisaidid</em> iga külastajate kasutatav aadress, näiteks{" "}
        <code>https://example.com</code> ja <code>https://www.example.com</code>.
      </p>
      <p className="callout">
        Saidivõti on teadlikult avalik: see töötab ainult teie lubatud veebisaitidel. Kui seda kuritarvitatakse, vahetage see
        samal ekraanil välja ja uuendage oma saidil koodijuppi.
      </p>

      <h2 id="platforms">Platvormid</h2>
      <h3>WordPress</h3>
      <p>
        Kasutage päise ja jaluse koodipluginat (näiteks <em>WPCode</em>) ja lisage koodijupp kogu saidi jalusesse või kleepige
        see oma teema faili <code>footer.php</code> enne silti <code>&lt;/body&gt;</code>.
      </p>
      <h3>Shopify</h3>
      <p>
        <em>Online Store → Themes → Edit code</em>, avage <code>layout/theme.liquid</code> ja kleepige koodijupp enne silti{" "}
        <code>&lt;/body&gt;</code>.
      </p>
      <h3>Webflow, Wix ja Squarespace</h3>
      <p>
        Lisage see kogu saiti hõlmava kohandatud koodina jalusesse: <em>Site settings → Custom code</em> (Webflow),{" "}
        <em>Settings → Custom code</em> (Wix) või <em>Settings → Advanced → Code injection</em> (Squarespace).
      </p>
      <h3>React, Next.js ja muud üheleherakendused</h3>
      <p>
        Laadige skript üks kord, näiteks juurpaigutuses. Vidin säilitab vestluse kliendipoolsete lehevahetuste ajal ise.
      </p>

      <h2 id="javascript-api">JavaScripti API</h2>
      <p>
        Soovi korral määrake enne skripti laadimist <code>window.Apex</code>, et konkreetsel lehel mõnda seadet muuta:
      </p>
      <pre>
        <code>{API_EXAMPLE}</code>
      </pre>
      <p>
        Pärast laadimist võimaldab <code>window.Apex</code> vidinat teie enda koodiga juhtida. Enne laadimist tehtud kutsed
        pannakse järjekorda ja täidetakse järjest.
      </p>
      <pre>
        <code>{METHODS_EXAMPLE}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Sündmus</th>
            <th>Millal see käivitub</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>open</code> / <code>close</code>
            </td>
            <td>Vestlusaken avatakse või suletakse</td>
          </tr>
          <tr>
            <td>
              <code>message</code>
            </td>
            <td>
              Vastuse voogedastus on lõppenud; saadakse <code>{"{ text, sources }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>lead</code>
            </td>
            <td>
              Külastaja esitas kontaktivormi; saadakse <code>{"{ email, name, phone }"}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>handoff</code>
            </td>
            <td>Külastaja saatis taotluse „Räägi inimesega“</td>
          </tr>
        </tbody>
      </table>

      <h2 id="privacy">Privaatsusseaded</h2>
      <ul>
        <li>
          Vestlused kustutatakse automaatselt pärast säilitusaega, mille määrate jaotises <em>Paigaldamine ja turvalisus</em>{" "}
          (vaikimisi 30 päeva).
        </li>
        <li>
          Külastajad saavad igal ajal alustada uut vestlust, mis kustutab vana nende brauserist. Iga salvestatud vestluse saate
          kustutada lehel „Vestlused“.
        </li>
        <li>E-posti aadressid, telefoni- ja kaardinumbrid maskeeritakse meie logides.</li>
        <li>
          Lisage privaatsuspoliitika link jaotises <em>Sõnumid</em>, et see kuvataks vidina jaluses.
        </li>
      </ul>

      <h2 id="troubleshooting">Tõrkeotsing</h2>
      <h3>Avamisnuppu ei kuvata</h3>
      <ul>
        <li>
          Kontrollige, et lehe täpne aadress (koos <code>www</code> ja <code>https</code> osaga) oleks loetletud jaotises{" "}
          <em>Lubatud veebisaidid</em>. Kui pole, kuvab brauseri konsool teate{" "}
          <code>[Apex] Widget disabled: origin_not_allowed</code>.
        </li>
        <li>
          Kontrollige, et leht ei asuks ühelgi jaotises <em>Käitumine → Peida nendel lehtedel</em> loetletud teel.
        </li>
        <li>
          Veenduge, et koodijupi <code>src</code> viitab aadressile <code>{apiUrl()}/widget.js</code> ja saidivõti ühtib teie
          töölaual olevaga. Pärast võtme vahetamist lakkab vana koodijupp töötamast.
        </li>
      </ul>
      <h3>See ütleb liiga sageli „ma ei tea“</h3>
      <ul>
        <li>
          Vaadake <em>Teadmusbaasi</em>: veebisaidi allikas, mille lugemine ebaõnnestus või kust leiti vähe lehti, näitab
          põhjust.
        </li>
        <li>Lisage puuduv teave tekstiallikana.</li>
        <li>
          Väikeste teadmusbaaside puhul seadke <em>Isikupära → Vastuse kindlus</em> väärtusele <em>Leebe</em>.
        </li>
      </ul>
      <h3>Vastused lakkasid</h3>
      <p>
        Võib-olla on jaotises <em>Paigaldamine ja turvalisus</em> määratud päevane tokenieelarve otsa saanud; sel juhul pakub
        vestlus kuni UTC keskööni inimesele üleandmist. Võite vaadata ka <a href="/et/status">süsteemi oleku</a> lehte.
      </p>
    </>
  );
}

export const docs: ProseContent = {
  eyebrow: "Dokumentatsioon",
  title: "Apex Boti seadistamine",
  intro: "Kõik, mida vajate registreerumisest kuni töötava assistendini oma veebisaidil. Enamikul saitidel võtab see alla kümne minuti.",
  toc: TOC,
  body: Body,
};
