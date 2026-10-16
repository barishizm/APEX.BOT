import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Klausimai, kurių jums nebereikės atsakinėti" },
  { id: "sources", label: "Dokumentacija, kainos ir pagalbos centras" },
  { id: "in-app", label: "Jūsų produkte" },
  { id: "handoff", label: "Kai reikia žmogaus" },
  { id: "safety", label: "Saugus viešoje svetainėje" },
  { id: "faq", label: "Klausimai" },
];

const IN_APP_EXAMPLE = `<script>
  // Atidarykite pokalbį savo mygtuku „Pagalba“
  document.querySelector("#help").addEventListener("click", () => Apex.open())

  // Paklauskite lankytojo vardu iš kainų paaiškinimo
  Apex.send("Kas įeina į Pro planą?")

  // Užpildykite perdavimo ir kontaktų formas prisijungusiam naudotojui
  Apex.identify({ name: "Ada", email: "ada@example.com" })

  // Siųskite pokalbio įvykius į savo analitiką
  Apex.on("handoff", () => analytics.track("support_handoff"))
</script>`;

function Body() {
  return (
    <>
      <h2 id="questions">Klausimai, kurių jums nebereikės atsakinėti</h2>
      <p>
        Programinės įrangos įmonės kasdien atsako į tuos pačius klausimus – prieš pardavimą ir po jo. Dauguma jų aprašyti
        dokumentacijoje ar kainų puslapyje, tačiau lankytojai jų neranda arba nenori ieškoti:
      </p>
      <ul>
        <li>
          <strong>Prieš pardavimą:</strong> Ar jis integruojasi su X? Ar yra nemokamas planas? Kuo skiriasi Pro ir Business?
          Kur saugomi duomenys?
        </li>
        <li>
          <strong>Pradžia:</strong> Kaip pakviesti savo komandą? Kur rasti API raktą? Kaip prijungti savo domeną?
        </li>
        <li>
          <strong>Trikčių šalinimas:</strong> Kodėl nesuveikia webhook? Ką reiškia ši klaida? Kaip iš naujo nustatyti
          dviejų veiksnių autentifikavimą?
        </li>
      </ul>
      <p>
        Apex Bot į juos atsako remdamasis jūsų pačių turiniu ir pateikia nuorodą į tikslų puslapį, todėl jūsų komanda gali
        skirti laiką klausimams, kuriems tikrai reikia žmogaus.
      </p>

      <h2 id="sources">Dokumentacija, kainos ir pagalbos centras</h2>
      <p>
        Nurodykite Apex savo rinkodaros svetainę, dokumentaciją ir pagalbos centrą. Jis perskaito svetainės žemėlapį ir
        susietus puslapius tame pačiame domene, paiso <code>robots.txt</code> ir praleidžia navigaciją, poraštes bei slapukų
        juostas. Pridėkite tekstinių šaltinių apie tai, kas dar nėra vieša, pavyzdžiui, atsakymus, kuriuos jūsų pagalbos
        komanda pateikia dažnai.
      </p>
      <p>
        Atsakymai pateikiami tik iš šių šaltinių. Jei dokumentacijoje atsakymo į klausimą nėra, Apex pasako, kad nežino,
        užuot spėliojęs API parametrą ar žadėjęs funkciją iš jūsų plėtros plano.{" "}
        <a href="/lt/grounded-answers">Kaip veikia pagrįsti atsakymai</a>.
      </p>

      <h2 id="in-app">Jūsų produkte</h2>
      <p>
        Tas pats valdiklis veikia ir jūsų žiniatinklio programoje. Vieno puslapio programose, pavyzdžiui, React ar Next.js,
        įkelkite scenarijų vieną kartą pagrindiniame išdėstyme – pokalbis išlieka naršant kliento pusėje.{" "}
        <a href="/lt/docs#javascript-api">JavaScript API</a> leidžia jį valdyti jūsų pačių kodu:
      </p>
      <pre>
        <code>{IN_APP_EXAMPLE}</code>
      </pre>
      <p>
        Valdiklį taip pat galite paslėpti tam tikruose keliuose, pavyzdžiui, atsiskaitymų puslapiuose, skiltyje{" "}
        <em>Elgsena → Slėpti šiuose puslapiuose</em>.
      </p>

      <h2 id="handoff">Kai reikia žmogaus</h2>
      <p>
        Su konkrečia paskyra susijusioms problemoms reikia jūsų komandos. Įjungus perdavimą, lankytojas gali pasirinkti
        „Kalbėti su žmogumi“: klausimas ir visas pokalbis išsiunčiami el. paštu jūsų pagalbos adresu, o atsakę jūs bendraujate
        su juo tiesiogiai. Klausimai, į kuriuos asistentas negalėjo atsakyti, parodo, kokią dokumentaciją rašyti toliau.
      </p>

      <h2 id="safety">Saugus viešoje svetainėje</h2>
      <ul>
        <li>
          <strong>Susietas su domenu.</strong> Viešasis svetainės raktas veikia tik jūsų leistuose domenuose, todėl nukopijuotas
          kodo fragmentas niekur kitur neveiks.
        </li>
        <li>
          <strong>Jokių veiksmų.</strong> Asistentas negali kreiptis į jūsų API, keisti paskyrų ar vykdyti kodo. Raginimo
          injekcijos bandymas gali pakeisti tik tai, ką sako vienas pokalbis, ir nieko daugiau.
        </li>
        <li>
          <strong>Biudžetai.</strong> Užklausų ribos kiekvienam lankytojui ir dienos žetonų biudžetas užtikrina nuspėjamą
          naudojimą, net jei koks nors scenarijus nepaliaujamai bombarduoja valdiklį.
        </li>
        <li>
          <strong>Modelį renkatės jūs.</strong> Claude, OpenAI arba Gemini su automatiniu atsarginiu modeliu.
        </li>
      </ul>
      <p>
        Išsamiau – <a href="/lt/security">saugumo puslapyje</a>.
      </p>

      <h2 id="faq">Klausimai</h2>
      <h3>Ar jis gali atsakyti į klausimus apie konkretaus naudotojo paskyrą?</h3>
      <p>
        Ne. Apex neturi prieigos prie jūsų produkto duomenų. <code>Apex.identify()</code> tik iš anksto įrašo naudotojo vardą
        ir el. pašto adresą perdavimo ir kontaktų formose, kad jų nereikėtų rinkti ranka.
      </p>
      <h3>Kaip jis išlieka aktualus, kai išleidžiame naujovių?</h3>
      <p>
        Paskelbę naują dokumentaciją, iš naujo sinchronizuokite svetainės šaltinį, ir Apex ją perskaitys dar kartą.
        Tekstiniai šaltiniai atnaujinami vos juos išsaugojus.
      </p>
      <h3>Ar galiu apriboti, apie ką jis kalba?</h3>
      <p>
        Taip. Pridėkite savo instrukcijas dėl tono ir išvardykite temas, apie kurias jis turėtų mandagiai atsisakyti kalbėti,
        pavyzdžiui, teisinius klausimus ar dar neišleistas funkcijas.
      </p>
    </>
  );
}

export const saas: MarketingContent = {
  meta: {
    title: "DI klientų aptarnavimo pokalbių robotas SaaS įmonėms",
    description:
      "Atsakykite į klausimus prieš pardavimą, pradedant naudotis ir apie naudojimą remdamiesi dokumentacija, kainomis ir pagalbos centru – su šaltinių nuorodomis, perdavimu žmogui ir JavaScript API.",
    crumb: "SaaS",
  },
  eyebrow: "SaaS įmonėms",
  title: "DI klientų aptarnavimo pokalbių robotas SaaS įmonėms, atsakantis pagal jūsų dokumentaciją",
  intro:
    "Atsakykite į klausimus prieš pardavimą, pradedant naudotis ir apie naudojimą remdamiesi savo dokumentacija, kainų puslapiu ir pagalbos centru – svetainėje ir jūsų programoje.",
  toc: TOC,
  body: Body,
};
