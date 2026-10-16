import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Jautājumi, uz kuriem jums vairs nebūs jāatbild" },
  { id: "sources", label: "Dokumentācija, cenas un palīdzības centrs" },
  { id: "in-app", label: "Jūsu produktā" },
  { id: "handoff", label: "Kad vajadzīgs cilvēks" },
  { id: "safety", label: "Drošs publiskā vietnē" },
  { id: "faq", label: "Jautājumi" },
];

const IN_APP_EXAMPLE = `<script>
  // Atveriet tērzēšanu ar savu pogu “Palīdzība”
  document.querySelector("#help").addEventListener("click", () => Apex.open())

  // Jautājiet apmeklētāja vārdā no cenu paskaidrojuma
  Apex.send("Kas ir iekļauts Pro plānā?")

  // Aizpildiet nodošanas un kontaktu formas pieteiktam lietotājam
  Apex.identify({ name: "Ada", email: "ada@example.com" })

  // Sūtiet tērzēšanas notikumus uz savu analītiku
  Apex.on("handoff", () => analytics.track("support_handoff"))
</script>`;

function Body() {
  return (
    <>
      <h2 id="questions">Jautājumi, uz kuriem jums vairs nebūs jāatbild</h2>
      <p>
        Programmatūras uzņēmumi katru dienu atbild uz vieniem un tiem pašiem jautājumiem – pirms pārdošanas un pēc tās.
        Lielākā daļa ir aprakstīti dokumentācijā vai cenu lapā, taču apmeklētāji tos neatrod vai nevēlas meklēt:
      </p>
      <ul>
        <li>
          <strong>Pirms pārdošanas:</strong> Vai tas integrējas ar X? Vai ir bezmaksas plāns? Kāda ir atšķirība starp Pro un
          Business? Kur tiek glabāti dati?
        </li>
        <li>
          <strong>Darba sākšana:</strong> Kā uzaicināt savu komandu? Kur atrast API atslēgu? Kā pievienot savu domēnu?
        </li>
        <li>
          <strong>Problēmu novēršana:</strong> Kāpēc webhook nenostrādā? Ko nozīmē šī kļūda? Kā atiestatīt divfaktoru
          autentifikāciju?
        </li>
      </ul>
      <p>
        Apex Bot atbild uz tiem, izmantojot jūsu pašu saturu, ar saiti uz precīzo lapu, tāpēc jūsu komanda var veltīt laiku
        jautājumiem, kuriem patiešām vajadzīgs cilvēks.
      </p>

      <h2 id="sources">Dokumentācija, cenas un palīdzības centrs</h2>
      <p>
        Norādiet Apex savu mārketinga vietni, dokumentāciju un palīdzības centru. Tas izlasa vietnes karti un saistītās lapas
        tajā pašā domēnā, ievēro <code>robots.txt</code> un izlaiž navigāciju, kājenes un sīkdatņu joslas. Pievienojiet
        teksta avotus par to, kas vēl nav publisks, piemēram, atbildes, ko jūsu atbalsta komanda sniedz bieži.
      </p>
      <p>
        Atbildes tiek sniegtas tikai no šiem avotiem. Ja dokumentācijā atbildes uz jautājumu nav, Apex pasaka, ka nezina,
        nevis min API parametru vai sola funkciju no jūsu attīstības plāna.{" "}
        <a href="/lv/grounded-answers">Kā darbojas pamatotas atbildes</a>.
      </p>

      <h2 id="in-app">Jūsu produktā</h2>
      <p>
        Tas pats logrīks darbojas arī jūsu tīmekļa lietotnē. Vienas lapas lietotnēs, piemēram, React vai Next.js, ielādējiet
        skriptu vienreiz saknes izkārtojumā – saruna saglabājas, pārvietojoties klienta pusē.{" "}
        <a href="/lv/docs#javascript-api">JavaScript API</a> ļauj to vadīt ar jūsu pašu kodu:
      </p>
      <pre>
        <code>{IN_APP_EXAMPLE}</code>
      </pre>
      <p>
        Logrīku var arī paslēpt noteiktos ceļos, piemēram, norēķinu lapās, sadaļā <em>Uzvedība → Slēpt šajās lapās</em>.
      </p>

      <h2 id="handoff">Kad vajadzīgs cilvēks</h2>
      <p>
        Ar konkrētu kontu saistītām problēmām vajadzīga jūsu komanda. Kad nodošana ir ieslēgta, apmeklētājs var izvēlēties
        “Runāt ar cilvēku”: jautājums un visa saruna tiek nosūtīti pa e-pastu uz jūsu atbalsta adresi, un, kad atbildat, jūs
        sarunājaties ar viņu tieši. Jautājumi, uz kuriem asistents nevarēja atbildēt, parāda, kādu dokumentāciju rakstīt tālāk.
      </p>

      <h2 id="safety">Drošs publiskā vietnē</h2>
      <ul>
        <li>
          <strong>Piesaistīts domēnam.</strong> Publiskā vietnes atslēga darbojas tikai jūsu atļautajos domēnos, tāpēc
          nokopēts koda fragments nekur citur nedarbosies.
        </li>
        <li>
          <strong>Nekādu darbību.</strong> Asistents nevar izsaukt jūsu API, mainīt kontus vai izpildīt kodu. Uzvednes
          injekcijas mēģinājums var mainīt tikai to, ko saka viena saruna, un neko vairāk.
        </li>
        <li>
          <strong>Budžeti.</strong> Pieprasījumu ierobežojumi katram apmeklētājam un dienas tokenu budžets nodrošina
          prognozējamu lietojumu, pat ja kāds skripts nemitīgi bombardē logrīku.
        </li>
        <li>
          <strong>Modeli izvēlaties jūs.</strong> Claude, OpenAI vai Gemini ar automātisku rezerves modeli.
        </li>
      </ul>
      <p>
        Sīkāk – <a href="/lv/security">drošības lapā</a>.
      </p>

      <h2 id="faq">Jautājumi</h2>
      <h3>Vai tas var atbildēt uz jautājumiem par konkrēta lietotāja kontu?</h3>
      <p>
        Nē. Apex nav piekļuves jūsu produkta datiem. <code>Apex.identify()</code> tikai iepriekš aizpilda lietotāja vārdu un
        e-pasta adresi nodošanas un kontaktu formās, lai tie nebūtu jāraksta.
      </p>
      <h3>Kā tas paliek aktuāls, kad izlaižam jaunumus?</h3>
      <p>
        Pēc jaunas dokumentācijas publicēšanas sinhronizējiet vietnes avotu vēlreiz, un Apex to izlasīs no jauna. Teksta avoti
        tiek atjaunināti, tiklīdz tos saglabājat.
      </p>
      <h3>Vai varu ierobežot, par ko tas runā?</h3>
      <p>
        Jā. Pievienojiet savus norādījumus par toni un uzskaitiet tēmas, par kurām tam pieklājīgi jāatsakās runāt, piemēram,
        juridiskus jautājumus vai vēl neizlaistas funkcijas.
      </p>
    </>
  );
}

export const saas: MarketingContent = {
  meta: {
    title: "MI klientu atbalsta tērzēšanas robots SaaS uzņēmumiem",
    description:
      "Atbildiet uz jautājumiem pirms pārdošanas, darba sākšanas un lietošanas laikā, izmantojot dokumentāciju, cenas un palīdzības centru – ar avotu saitēm, nodošanu cilvēkam un JavaScript API.",
    crumb: "SaaS",
  },
  eyebrow: "SaaS uzņēmumiem",
  title: "MI klientu atbalsta tērzēšanas robots SaaS uzņēmumiem, kas atbild pēc jūsu dokumentācijas",
  intro:
    "Atbildiet uz jautājumiem pirms pārdošanas, darba sākšanas un lietošanas laikā, izmantojot savu dokumentāciju, cenu lapu un palīdzības centru – vietnē un jūsu lietotnē.",
  toc: TOC,
  body: Body,
};
