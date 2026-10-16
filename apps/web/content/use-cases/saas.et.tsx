import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Küsimused, millele te ei pea enam vastama" },
  { id: "sources", label: "Dokumentatsioon, hinnad ja abikeskus" },
  { id: "in-app", label: "Teie tootes" },
  { id: "handoff", label: "Kui on vaja inimest" },
  { id: "safety", label: "Turvaline avalikul saidil" },
  { id: "faq", label: "Küsimused" },
];

const IN_APP_EXAMPLE = `<script>
  // Avage vestlus oma nupuga „Abi“
  document.querySelector("#help").addEventListener("click", () => Apex.open())

  // Küsige külastaja eest hinnakirja vihjest
  Apex.send("Mida Pro-pakett sisaldab?")

  // Täitke sisseloginud kasutaja jaoks üleandmis- ja kontaktivorm ette
  Apex.identify({ name: "Ada", email: "ada@example.com" })

  // Saatke vestluse sündmused oma analüütikasse
  Apex.on("handoff", () => analytics.track("support_handoff"))
</script>`;

function Body() {
  return (
    <>
      <h2 id="questions">Küsimused, millele te ei pea enam vastama</h2>
      <p>
        Tarkvaraettevõtted vastavad iga päev samadele küsimustele – enne müüki ja pärast seda. Enamik neist on dokumentatsioonis
        või hinnalehel kirjas, kuid külastajad ei leia neid üles või ei taha otsida:
      </p>
      <ul>
        <li>
          <strong>Enne müüki:</strong> Kas see integreerub X-iga? Kas on tasuta pakett? Mis vahe on Pro- ja Business-paketil?
          Kus andmeid hoitakse?
        </li>
        <li>
          <strong>Kasutuselevõtt:</strong> Kuidas oma meeskonda kutsuda? Kust leida API-võti? Kuidas oma domeen ühendada?
        </li>
        <li>
          <strong>Tõrkeotsing:</strong> Miks webhook ei käivitu? Mida see veateade tähendab? Kuidas kaheastmelist autentimist
          lähtestada?
        </li>
      </ul>
      <p>
        Apex Bot vastab neile teie enda sisu põhjal ja lisab lingi täpsele lehele, nii et teie meeskond saab pühendada aega
        küsimustele, mis tõesti inimest vajavad.
      </p>

      <h2 id="sources">Dokumentatsioon, hinnad ja abikeskus</h2>
      <p>
        Suunake Apex oma turundussaidile, dokumentatsioonile ja abikeskusele. See loeb saidikaardi ja samas domeenis olevad
        lingitud lehed, järgib faili <code>robots.txt</code> ning jätab vahele navigatsiooni, jalused ja küpsiseribad. Lisage
        tekstiallikad asjade kohta, mis pole veel avalikud, näiteks vastused, mida teie tugimeeskond sageli annab.
      </p>
      <p>
        Vastused tulevad ainult nendest allikatest. Kui teie dokumentatsioon küsimusele ei vasta, ütleb Apex, et ei tea,
        selle asemel et arvata API parameetrit või lubada funktsiooni teie arenduskavast.{" "}
        <a href="/et/grounded-answers">Kuidas põhjendatud vastused töötavad</a>.
      </p>

      <h2 id="in-app">Teie tootes</h2>
      <p>
        Sama vidin töötab ka teie veebirakenduses. Üheleherakendustes, nagu React või Next.js, laadige skript üks kord
        juurpaigutuses – vestlus säilib kliendipoolse navigeerimise ajal.{" "}
        <a href="/et/docs#javascript-api">JavaScripti API</a> võimaldab seda teie enda koodiga juhtida:
      </p>
      <pre>
        <code>{IN_APP_EXAMPLE}</code>
      </pre>
      <p>
        Vidina saate peita ka teatud teedel, näiteks arvelduslehtedel, jaotises <em>Käitumine → Peida nendel lehtedel</em>.
      </p>

      <h2 id="handoff">Kui on vaja inimest</h2>
      <p>
        Konkreetse kontoga seotud probleemide jaoks on vaja teie meeskonda. Kui üleandmine on sisse lülitatud, saab külastaja
        valida „Räägi inimesega“: küsimus ja kogu vestlus saadetakse e-postiga teie tugiaadressile ning vastates suhtlete
        temaga otse. Küsimused, millele assistent vastata ei osanud, näitavad, millist dokumentatsiooni järgmisena kirjutada.
      </p>

      <h2 id="safety">Turvaline avalikul saidil</h2>
      <ul>
        <li>
          <strong>Domeeniga seotud.</strong> Avalik saidivõti töötab ainult teie lubatud domeenides, seega ei tööta kopeeritud
          koodijupp mujal.
        </li>
        <li>
          <strong>Toiminguid pole.</strong> Assistent ei saa teie API-t kasutada, kontosid muuta ega koodi käivitada.
          Viibasüsti katse saab muuta ainult seda, mida ütleb üks vestlus, ja mitte midagi enamat.
        </li>
        <li>
          <strong>Eelarved.</strong> Külastajapõhised päringupiirangud ja päevane tokenieelarve hoiavad kasutuse
          prognoositavana ka siis, kui mõni skript vidinat lakkamatult pommitab.
        </li>
        <li>
          <strong>Mudeli valite teie.</strong> Claude, OpenAI või Gemini koos automaatse varumudeliga.
        </li>
      </ul>
      <p>
        Üksikasjad leiate <a href="/et/security">turvalisuse lehelt</a>.
      </p>

      <h2 id="faq">Küsimused</h2>
      <h3>Kas see saab vastata küsimustele konkreetse kasutaja konto kohta?</h3>
      <p>
        Ei. Apexil puudub juurdepääs teie toote andmetele. <code>Apex.identify()</code> täidab üleandmis- ja kontaktivormis
        ainult kasutaja nime ja e-posti aadressi ette, et neid ei peaks sisestama.
      </p>
      <h3>Kuidas see uute väljalasete puhul ajakohasena püsib?</h3>
      <p>
        Pärast uue dokumentatsiooni avaldamist sünkroonige veebisaidi allikas uuesti ja Apex loeb selle uuesti. Tekstiallikad
        uuenevad kohe, kui need salvestate.
      </p>
      <h3>Kas saan piirata, millest see räägib?</h3>
      <p>
        Jah. Lisage oma juhised tooni kohta ja loetlege teemad, millest see peaks viisakalt keelduma, näiteks õigusküsimused või
        avaldamata funktsioonid.
      </p>
    </>
  );
}

export const saas: MarketingContent = {
  meta: {
    title: "TI klienditoe vestlusrobot SaaS-ettevõtetele",
    description:
      "Vastake müügieelsetele, kasutuselevõtu- ja kasutusküsimustele oma dokumentatsiooni, hinnakirja ja abikeskuse põhjal – allikalinkide, inimesele üleandmise ja rakendusesisese JavaScripti API-ga.",
    crumb: "SaaS",
  },
  eyebrow: "SaaS-ettevõtetele",
  title: "TI klienditoe vestlusrobot SaaS-ettevõtetele, mis vastab teie dokumentatsiooni põhjal",
  intro:
    "Vastake müügieelsetele, kasutuselevõtu- ja kasutusküsimustele oma dokumentatsiooni, hinnalehe ja abikeskuse põhjal – nii veebisaidil kui ka teie rakenduses.",
  toc: TOC,
  body: Body,
};
