import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { billingTerms } from "../legal";
import type { ProseContent } from "../types";

const PRICING = "/lv/pricing";
const PADDLE_TERMS = "https://www.paddle.com/legal/checkout-buyer-terms";

function Body() {
  const n = billingTerms("lv");
  return (
    <>
      <h2>1. Pakalpojums</h2>
      <p>
        Apex Bot (“Apex”, “mēs”) nodrošina mākslīgā intelekta asistentu, kas atbild uz jūsu vietnes apmeklētāju jautājumiem,
        izmantojot jūsu sniegto saturu, kopā ar vadības paneli tā konfigurēšanai. Uzlabojot pakalpojumu, funkcijas var mainīties,
        un, kamēr Apex ir beta versijā, mēs varam ierobežot vai uz laiku apturēt piekļuvi.
      </p>

      <h2>2. Jūsu konts</h2>
      <ul>
        <li>Reģistrējoties jums jāsniedz precīza informācija un jāglabā sava parole drošībā.</li>
        <li>Jūs esat atbildīgs par darbībām savā darbvietā, tostarp par jūsu uzaicināto komandas biedru darbībām.</li>
        <li>
          Jums jābūt pietiekami vecam, lai saskaņā ar jūsu dzīvesvietas tiesību aktiem varētu noslēgt saistošu līgumu, un,
          reģistrējoties kā uzņēmumam, jārīkojas sava uzņēmuma vārdā.
        </li>
      </ul>

      <h2>3. Jūsu saturs un jūsu vietne</h2>
      <p>
        Jums saglabājas visas tiesības uz saturu, ko sniedzat Apex (vietnes lapām, tekstu, iestatījumiem), un uz sarunām jūsu
        vietnē. Jūs dodat mums atļauju to glabāt un apstrādāt tikai tādēļ, lai sniegtu jums pakalpojumu. Jūs apstiprināt, ka
        jums ir tiesības izmantot šo saturu un ka Apex drīkst lasīt vietnes, kuras tam norādāt.
      </p>

      <h2>4. MI ģenerētas atbildes</h2>
      <p>
        Atbildes no jūsu satura ģenerē trešo pušu MI modeļi. Tās var būt nepilnīgas vai kļūdainas. Apex parāda apmeklētājiem,
        ka viņi sarunājas ar MI, un jūs joprojām esat atbildīgs par informāciju savā vietnē un uz tās pamata pieņemtajiem
        lēmumiem. Nepaļaujieties uz asistentu medicīnisku, juridisku vai finanšu padomu saņemšanā.
      </p>

      <h2>5. Pieļaujamā lietošana</h2>
      <p>Jūs apņematies neizmantot Apex, lai:</p>
      <ul>
        <li>pārkāptu likumu, aizskartu citu personu tiesības vai maldinātu apmeklētājus par to, ar ko viņi sarunājas;</li>
        <li>
          vāktu sensitīvus personas datus bez likumīga pamata un paziņojumiem, ko pieprasa VDAR, KVKK vai līdzīgi tiesību akti;
        </li>
        <li>uzbruktu pakalpojumam, to pārslogotu vai veiktu tā reverso inženieriju, vai apietu tā lietojuma ierobežojumus vai drošības kontroles.</li>
      </ul>

      <h2>6. Privātums</h2>
      <p>
        Mūsu <a href="/lv/privacy">privātuma politikā</a> ir paskaidrots, kā mēs apstrādājam personas datus. Kad jūsu
        apmeklētāji sarunājas ar jūsu asistentu, jūs esat viņu datu pārzinis, un mēs tos apstrādājam jūsu vārdā.
      </p>

      <h2>7. Plāni un maksa</h2>
      <p>
        Apex piedāvā bezmaksas plānu un maksas plānus (Starter, Pro un Business), kuru MI atbildes, vietnes un funkcijas ir
        norādītas <a href={PRICING}>cenu lapā</a>. Par maksas plāniem maksā avansā, katru mēnesi vai katru gadu, ASV dolāros.
      </p>
      <p>
        Beta laikā Apex ir bez maksas. Maksas plāni sākas palaišanas datumā, par kuru paziņojam pa e-pastu vismaz{" "}
        {n.noticeDays} dienas iepriekš. Palaišanas brīdī katra beta darbvieta uz {n.betaDays} dienām bez maksas un bez kartes
        saņem maksas plānu, kas atbilst tās nesenajam lietojumam; ja līdz tam neabonēsiet, pēc tam tā pāries uz bezmaksas
        plānu. Pāreja uz mazāku plānu neko nedzēš: vietnes virs ierobežojuma tiek apturētas, un augstāka plāna funkcijas netiek
        piemērotas, līdz atkal izvēlēsieties lielāku plānu.
      </p>

      <h2>8. Maksājumi caur Paddle</h2>
      <p>
        Mūsu pasūtījumu procesu nodrošina mūsu tiešsaistes tālākpārdevējs Paddle.com. Paddle.com ir visu mūsu pasūtījumu
        pārdevējs (Merchant of Record): Paddle pārdod jums abonementu, pieņem maksājumu, izraksta rēķinu un risina ar
        norēķiniem saistītos jautājumus un atmaksas saskaņā ar saviem <a href={PADDLE_TERMS}>Pircēja noteikumiem</a>. Jūsu
        kartes vai citi maksājuma dati nonāk pie Paddle, nevis pie mums. Apex lietošanu joprojām regulē šie noteikumi.
      </p>

      <h2>9. Nodokļi</h2>
      <p>
        Cenu lapā norādītās cenas neietver nodokļus. Kā pārdevējs Paddle aprēķina jūsu atrašanās vietā piemērojamo PVN,
        pārdošanas nodokli vai GST, pievieno to apmaksas brīdī un samaksā nodokļu iestādēm. Ja pērkat uzņēmuma vajadzībām un
        norādāt derīgu PVN numuru, tā vietā var tikt piemērota apgrieztā maksāšana. Paddle rēķinā ir norādīts piemērotais
        nodoklis.
      </p>

      <h2>10. Atjaunošana, izmaiņas un atcelšana</h2>
      <ul>
        <li>
          Abonements automātiski atjaunojas katra mēneša vai gada perioda beigās, un Paddle iekasē maksu no saglabātā
          maksājuma veida, līdz jūs to atceļat.
        </li>
        <li>
          Pāreja uz lielāku plānu stājas spēkā uzreiz, un par atlikušo perioda daļu jūs samaksājat starpību. Pāreja uz mazāku
          plānu stājas spēkā apmaksātā perioda beigās. Pāreja no gada uz mēneša norēķiniem stājas spēkā uzreiz, un neizmantotais
          laiks tiek ieskaitīts jūsu Paddle bilancē.
        </li>
        <li>
          Abonementu varat atcelt jebkurā laikā vadības panelī sadaļā Iestatījumi → Norēķini. Plāns darbojas līdz apmaksātā
          perioda beigām un netiek atjaunots; pēc tam darbvieta izmanto bezmaksas plānu.
        </li>
        <li>
          Ja maksājums neizdodas, darbvieta saglabā savu plānu {n.graceDays} dienas, kamēr maksājums tiek mēģināts atkārtoti.
          Ja tas joprojām nav izdevies, darbvieta pāriet uz bezmaksas plānu.
        </li>
        <li>
          Par cenas izmaiņām paziņojam vismaz {n.noticeDays} dienas pirms tās skar jūsu abonementu. Tās piemēro no nākamās
          atjaunošanas pēc tam, un līdz tam jūs varat abonementu atcelt.
        </li>
      </ul>

      <h2>11. Atmaksa</h2>
      <p>
        Ja Apex jums neder, {n.refundDays} dienu laikā pēc maksājuma varat lūgt pilnu abonementa pirmā maksājuma vai gada
        atjaunošanas maksājuma atmaksu. Citi maksājumi, tostarp mēneša atjaunošanas, perioda atlikums pēc atcelšanas un jau
        izmantotās papildu atbildes, netiek atmaksāti, izņemot norēķinu kļūdas gadījumu vai ja tiesības uz atmaksu paredz
        likums (piemēram, patērētāja atteikuma tiesības). Atmaksu uz sākotnējo maksājuma veidu veic Paddle; pieprasiet to,
        izmantojot saiti Paddle kvītī, vai rakstot mums e-pastu.
      </p>

      <h2>12. Papildu atbildes</h2>
      <p>
        Katrā plānā ir iekļauts noteikts MI atbilžu skaits mēneša periodā; atbilde ar ātru modeli tiek skaitīta kā piektdaļa,
        ar Claude Opus 5.5 – kā divas un ar Claude Fable 5.1 – kā piecas. Kad tās beidzas, asistents atbildes vietā piedāvā
        nodošanas veidlapu, un nekas vairāk netiek iekasēts. Maksas plānā norēķinu iestatījumos varat ieslēgt papildu
        atbildes: tās maksā {n.blockPrice} par {n.blockReplies} atbildēm, tiek izmantotas veselos blokos līdz jūsu noteiktajam
        mēneša limitam. Paddle tās iekasē no abonementa maksājuma veida katra mēneša perioda beigās, nekad vairāk par jūsu
        limitu. Tās izslēgt vai limitu mainīt varat jebkurā laikā; izmaiņas ir spēkā no tā brīža.
      </p>

      <h2>13. Lietošanas izbeigšana</h2>
      <p>
        Jūs jebkurā laikā varat pārtraukt Apex lietošanu, noņemot logrīku no savas vietnes un lūdzot mums dzēst jūsu kontu. Mēs
        varam apturēt kontus, kas pārkāpj šos noteikumus vai apdraud pakalpojumu vai citus klientus.
      </p>

      <h2>14. Atbildība</h2>
      <p>
        Beta versijas laikā pakalpojums tiek sniegts “tāds, kāds tas ir”. Ciktāl to pieļauj tiesību akti, mēs neatbildam par
        netiešiem vai izrietošiem zaudējumiem, un mūsu kopējā atbildība nepārsniedz summu, ko jūs mums samaksājāt divpadsmit
        mēnešos pirms prasības iesniegšanas.
      </p>

      <h2>15. Izmaiņas un kontakti</h2>
      <p>
        Mēs varam atjaunināt šos noteikumus; par būtiskām izmaiņām mēs jums paziņosim pirms to stāšanās spēkā. Jautājumi:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const terms: ProseContent = {
  eyebrow: "Juridiskā informācija",
  title: "Pakalpojuma noteikumi",
  intro: `Versija ${TERMS_VERSION}. Šie noteikumi attiecas uz Apex Bot lietošanu, tostarp vadības paneli un tērzēšanas logrīku, ko uzstādāt savā vietnē.`,
  body: Body,
};
