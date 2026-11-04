import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="who">Uz ko tā attiecas</h2>
      <ul>
        <li>
          <strong>Klienti</strong>: personas, kas izveido Apex kontu un iestata asistentu, kā arī personas mūsu gaidīšanas
          sarakstā. Jūsu konta datu pārzinis esam mēs.
        </li>
        <li>
          <strong>Apmeklētāji</strong>: personas, kas sarunājas ar asistentu klienta vietnē. Datu pārzinis ir klients; mēs
          apstrādājam apmeklētāju datus viņa vārdā un tikai saskaņā ar viņa norādījumiem.
        </li>
      </ul>
      <p>
        Šī politika apraksta, kā Apex Bot darbojas šodien. Kā mēs aizsargājam datus, sīkāk paskaidrots{" "}
        <a href="/lv/security">drošības</a> lapā.
      </p>

      <h2 id="collect">Ko mēs vācam</h2>
      <h3>No klientiem</h3>
      <table>
        <thead>
          <tr>
            <th>Dati</th>
            <th>Kāpēc</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vārds, lietotājvārds, e-pasta adrese, konta veids, uzņēmuma nosaukums un lielums (uzņēmumu kontiem)</td>
            <td>Lai izveidotu un uzturētu jūsu kontu un darbvietu</td>
          </tr>
          <tr>
            <td>Parole, kas tiek glabāta tikai kā sālīts scrypt jaucējkods. Kontiem, kas izmanto Google vai GitHub, nav paroles, ja vien jūs to neiestatāt</td>
            <td>Lai jūs pieteiktu</td>
          </tr>
          <tr>
            <td>
              Ja piesakāties ar Google vai GitHub: pakalpojuma sniedzēja konta ID un jūsu apstiprinātā e-pasta adrese un vārds.
              Mēs nekad neredzam jūsu Google vai GitHub paroli un nekad neko nepublicējam jūsu kontā
            </td>
            <td>Lai jūs pieteiktu un saistītu pakalpojuma sniedzēju ar jūsu kontu</td>
          </tr>
          <tr>
            <td>Kad piekritāt noteikumiem, kurai to versijai, un jūsu izvēle attiecībā uz modeļu apmācību</td>
            <td>Lai saglabātu jūsu piekrišanas ierakstu</td>
          </tr>
          <tr>
            <td>Drošības žurnāls: pieteikšanās, neveiksmīgas pieteikšanās, apstiprināšanas un paroles atiestatīšanas
              pieprasījumi, paroles maiņa, izrakstīšanās citās ierīcēs un konta dzēšana – katrs ar laiku, IP adresi un pārlūku</td>
            <td>Lai aizsargātu kontus, ierobežotu minēšanu un ļaunprātīgu izmantošanu un izmeklētu incidentus</td>
          </tr>
          <tr>
            <td>Aktīvās sesijas: IP adrese, pārlūks un kad katra pēdējoreiz izmantota</td>
            <td>Lai jūs paliktu pieteikts un varētu izrakstīties citās ierīcēs</td>
          </tr>
          <tr>
            <td>Jūsu asistenta iestatījumi, vietnes, kurās atļaujat tam darboties, lapas, ko Apex izlasa jūsu vietnē, un jūsu
              pievienotais teksts</td>
            <td>Lai atbildētu jūsu apmeklētājiem</td>
          </tr>
          <tr>
            <td>Jūsu iestatītā nodošanas e-pasta adrese un apstiprinājuma kods, ko uz to nosūtām</td>
            <td>Lai pirms sūtīšanas apstiprinātu, ka adrese pieder jums</td>
          </tr>
          <tr>
            <td>Katra asistenta dienā izmantoto MI tokenu skaits</td>
            <td>Lai nodrošinātu jūsu iestatīto dienas budžetu un prognozējamas izmaksas</td>
          </tr>
          <tr>
            <td>E-pasta adrese (un lapas valoda), ja pievienojaties gaidīšanas sarakstam</td>
            <td>Lai vienreiz jums paziņotu, kad atvērsim reģistrāciju. Citiem nolūkiem mēs to neizmantojam</td>
          </tr>
          <tr>
            <td>Norēķini: darbvietas plāns, abonementa statuss un atjaunošanas datumi, Paddle klienta un abonementa ID, Paddle izrakstītie rēķini un MI atbilžu skaits mēnesī katrai darbvietai. Kartes un citi maksājuma dati tiek ievadīti Paddle; mēs tos nekad neredzam un neglabājam</td>
            <td>Lai piemērotu jūsu apmaksāto plānu, iekasētu maksu par jūsu ieslēgtajām papildu atbildēm, rādītu rēķinus un sūtītu norēķinu e-pastus</td>
          </tr>
        </tbody>
      </table>

      <h3>No klienta vietnes apmeklētājiem</h3>
      <table>
        <thead>
          <tr>
            <th>Dati</th>
            <th>Kāpēc</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Apmeklētāja rakstītās ziņas un asistenta atbildes ar avotu lapām, kas redzamas zem katras atbildes</td>
            <td>Lai uzturētu sarunu un parādītu to klientam</td>
          </tr>
          <tr>
            <td>Atbildes pozitīvs vai negatīvs novērtējums</td>
            <td>Lai parādītu klientam, kuras atbildes jāuzlabo</td>
          </tr>
          <tr>
            <td>Vietnes adrese, kurā notika saruna</td>
            <td>Lai nodrošinātu atļauto vietņu sarakstu un grupētu sarunas</td>
          </tr>
          <tr>
            <td>Vārds, e-pasta adrese un tālrunis, tikai ja apmeklētājs pats izvēlas tos ievadīt (nodošanas pieprasījumā vai
              klienta kontaktu formā)</td>
            <td>Lai pa e-pastu nodotu pieprasījumu vai kontaktu klientam un parādītu to viņa vadības panelī</td>
          </tr>
          <tr>
            <td>Apmeklētāja IP adrese, īslaicīgi glabāta atmiņā</td>
            <td>Lai ierobežotu ziņu skaitu vienam apmeklētājam. Kopā ar sarunu tā netiek saglabāta</td>
          </tr>
        </tbody>
      </table>
      <p>
        Mēs nepārdodam personas datus, neizmantojam tos reklāmai un neveidojam reklāmas profilus. Apmeklētājiem netiek lūgts
        izveidot kontu, un logrīks viņiem paziņo, ka viņi sarunājas ar MI. Tērzēšanā apmeklētājiem nevajadzētu lūgt sensitīvu
        informāciju (veselības dati, maksājumu kartes, personas kodi); ja apmeklētājs to tomēr ievada, tā tiek apstrādāta kā
        jebkura cita ziņa, un karšu, tālruņu, e-pasta un IBAN paraugi mūsu žurnālos tiek maskēti.
      </p>

      <h2 id="use">Kā mēs izmantojam datus</h2>
      <ul>
        <li>Lai sniegtu pakalpojumu: pieteiktu jūs, atbildētu apmeklētājiem, piegādātu nodošanas pieprasījumus un kontaktus, rādītu sarunas.</li>
        <li>Lai uzturētu pakalpojuma drošību: pieprasījumu ierobežojumi, robotu pārbaudes, ļaunprātīgas izmantošanas atklāšana un incidentu izmeklēšana.</li>
        <li>Lai sūtītu jums e-pastus: apstiprinājuma un paroles atiestatīšanas kodus, nodošanas un kontaktu paziņojumus un drošības paziņojumus.</li>
        <li>Lai iekasētu maksu par maksas plāniem: piemērotu plānu, skaitītu MI atbildes atbilstoši tam, iekasētu maksu par jūsu ieslēgtajām papildu atbildēm un sūtītu īpašniekiem e-pastus par maksājumiem, atjaunošanu, beta plāna beigām un lietojumu.</li>
        <li>Lai uzlabotu savus modeļus – tikai ja esat tam piekrituši (skatīt tālāk).</li>
        <li>Lai izpildītu juridiskās saistības.</li>
      </ul>
      <p>
        Juridiskais pamats (VDAR) un nosacījumi (KVKK): ar jums noslēgtā līguma izpilde; mūsu leģitīmās intereses drošības
        nodrošināšanā un ļaunprātīgas izmantošanas novēršanā; jūsu piekrišana, kad to lūdzam (modeļu apmācība, gaidīšanas
        saraksts); un juridiskās saistības. Apmeklētāju datu apstrādes nolūku un juridisko pamatu nosaka klients.
      </p>

      <h2 id="providers">Kas vēl apstrādā datus</h2>
      <p>
        Mēs izmantojam nelielu skaitu pakalpojumu sniedzēju (apakšapstrādātāju), katru tikai norādītajam uzdevumam. Mēs
        nesniedzam viņiem vairāk, nekā šim uzdevumam nepieciešams.
      </p>
      <table>
        <thead>
          <tr>
            <th>Pakalpojuma sniedzējs</th>
            <th>Kam</th>
            <th>Iesaistītie dati</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic, OpenAI vai Google (tas, ko klients izvēlējies šim asistentam)</td>
            <td>Atbilžu ģenerēšana</td>
            <td>Apmeklētāja ziņa, sarunas jaunākās ziņas un būtiskās klienta satura daļas. Ja klients izvēlas Gemini modeli, nākamās rindas piezīme par Google bezmaksas līmeni attiecas arī uz šiem datiem</td>
          </tr>
          <tr>
            <td>Google (Gemini API)</td>
            <td>Meklēšana: klienta satura un apmeklētāju jautājumu pārvēršana vektoros, lai asistents atrastu pareizās lapas</td>
            <td>Klienta lapu un pievienotā satura teksts un apmeklētāja ziņa (papildjautājumiem kopā ar iepriekšējo). Iegūtos vektorus glabājam savā datubāzē. Kamēr izmantojam Google bezmaksas līmeni, Google noteikumi ļauj tam izmantot šos datus savu produktu uzlabošanai</td>
          </tr>
          <tr>
            <td>Neon (pārvaldīta PostgreSQL)</td>
            <td>Datubāze</td>
            <td>Viss, ko glabājam: konti, iestatījumi, zināšanas, sarunas</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Vietnes un vadības paneļa mitināšana</td>
            <td>Pieprasījumi vietnei, ieskaitot IP adreses</td>
          </tr>
          <tr>
            <td>Render (Frankfurte, Vācija)</td>
            <td>Tērzēšanas API, ar ko sazinās logrīks, mitināšana</td>
            <td>Tērzēšanas pieprasījumi un notiekošā saruna</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>E-pastu sūtīšana</td>
            <td>Saņēmēja adrese un ziņas saturs (kodi, nodošanas pieprasījumi, kontakti)</td>
          </tr>
          <tr>
            <td>Cloudflare Turnstile</td>
            <td>Cilvēku atšķiršana no robotiem reģistrācijā, pieteikšanās laikā, atiestatot paroli un gaidīšanas sarakstā</td>
            <td>Pārbaudes marķieris, jūsu IP adrese un pārlūka signāli, kas vajadzīgi pārbaudes veikšanai</td>
          </tr>
          <tr>
            <td>Google un GitHub</td>
            <td>Pogas “Pieteikties ar”, tikai ja tās izmantojat</td>
            <td>Tas, ko pakalpojuma sniedzējs atgriež (skatīt iepriekš)</td>
          </tr>
          <tr>
            <td>Paddle (Paddle.com Market Ltd, Apvienotā Karaliste)</td>
            <td>Maksas plānu tālākpārdevējs un pārdevējs (Merchant of Record): apmaksas logs, maksājumi, rēķini, nodokļi, atmaksas un krāpšanas pārbaudes</td>
            <td>Vārds, e-pasta adrese, norēķinu valsts un adrese, PVN numurs, ja to norādāt, maksājuma dati (glabā tikai Paddle), kas iegādāts un darbvietas ID. Kā pārdevējs Paddle ir arī neatkarīgs pārzinis datiem, ko tas vāc apmaksas laikā, saskaņā ar savu <a href="https://www.paddle.com/legal/privacy">privātuma paziņojumu</a></td>
          </tr>
        </tbody>
      </table>
      <p>
        MI pakalpojumu sniedzēji apstrādā datus saskaņā ar saviem API noteikumiem, lai atgrieztu atbildi. Daži pakalpojumu
        sniedzēji atrodas ārpus Turcijas un ES/EEZ, tāpēc dati var tikt nosūtīti uz ārvalstīm; vajadzības gadījumā mēs
        paļaujamies uz tiesību aktos paredzētajām aizsardzības garantijām, piemēram, līguma standartklauzulām, un uz paša
        pakalpojuma sniedzēja saistībām. Mēs varam arī izpaust datus, ja to likumīgi pieprasa tiesa vai iestāde.
      </p>

      <h2 id="training">Modeļu apmācība</h2>
      <p>
        Klienta asistentus un sarunas savu modeļu uzlabošanai izmantojam tikai tad, ja klients tam piekrita reģistrācijas
        laikā. Pēc noklusējuma – nē. Šo izvēli jebkurā laikā varat mainīt vadības paneļa sadaļā “Konta iestatījumi” vai
        sazinoties ar mums; tas attiecas uz turpmāk apstrādātajiem datiem.
        Šī izvēle attiecas uz mūsu pašu modeļiem; ko Google var darīt ar datiem savā bezmaksas līmenī, ir aprakstīts iepriekš
        sniegtajā pakalpojumu sniedzēju tabulā.
      </p>

      <h2 id="retention">Cik ilgi mēs glabājam datus</h2>
      <table>
        <thead>
          <tr>
            <th>Dati</th>
            <th>Cik ilgi</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sarunas un tajās esošā kontaktinformācija</td>
            <td>
              Tiek automātiski dzēstas, kad tās nav izmantotas klienta iestatīto glabāšanas periodu – no 1 līdz 365 dienām (pēc
              noklusējuma 30). Klients jebkuru sarunu var dzēst agrāk vadības panelī, un apmeklētājs var lūgt klientam dzēst
              viņa sarunu
            </td>
          </tr>
          <tr>
            <td>Sesijas</td>
            <td>24 stundas pārlūka sesijai, 30 dienas ar “Palikt pieteiktam”. Izrakstoties, mainot vai atiestatot paroli, tās beidzas agrāk</td>
          </tr>
          <tr>
            <td>Apstiprinājuma un atiestatīšanas kodi</td>
            <td>Derīgi 15 minūtes; tiek glabāti tikai kā jaucējkods</td>
          </tr>
          <tr>
            <td>Konta dati, iestatījumi un zināšanas</td>
            <td>Kamēr pastāv konts. Dzēšot kontu, tie arī tiek dzēsti, ja vien tiesību akti neprasa kaut ko saglabāt</td>
          </tr>
          <tr>
            <td>Drošības žurnāls</td>
            <td>
              Tiek glabāts, lai mēs varētu izmeklēt ļaunprātīgu izmantošanu un incidentus. Dzēšot kontu, ieraksti tiek atsaistīti
              no tā, un jūs varat lūgt dzēst ierakstus, kuros ir jūsu e-pasta adrese vai IP adrese (mēs varam saglabāt to, ko
              prasa tiesību akti)
            </td>
          </tr>
          <tr>
            <td>Gaidīšanas saraksta e-pasta adrese</td>
            <td>Līdz reģistrācijas atvēršanai un paziņojumam jums vai līdz brīdim, kad lūdzat to noņemt</td>
          </tr>
          <tr>
            <td>Dienas tokenu skaits</td>
            <td>Kopā ar asistentu, kuram tie pieder</td>
          </tr>
          <tr>
            <td>Lietotņu žurnāli</td>
            <td>Ierobežotu laiku; e-pasta adreses, tālruņu numuri, karšu numuri un IBAN tiek maskēti pirms ierakstīšanas</td>
          </tr>
          <tr>
            <td>Norēķinu ieraksti (abonementi, rēķini, maksājumi)</td>
            <td>Tik ilgi, cik to prasa nodokļu un grāmatvedības tiesību akti, arī pēc konta dzēšanas. MI atbilžu skaits mēnesī tiek glabāts kopā ar darbvietu</td>
          </tr>
        </tbody>
      </table>
      <p>
        Mūsu pakalpojumu sniedzēju glabātie dati pēc dzēšanas vēl īsu laiku var palikt viņu rezerves kopijās un tiek noņemti,
        kad šīs kopijas tiek aizstātas.
      </p>

      <h2 id="cookies">Sīkdatnes un pārlūka krātuve</h2>
      <table>
        <thead>
          <tr>
            <th>Nosaukums</th>
            <th>Ko tā dara</th>
            <th>Derīguma termiņš</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>apex_session</td>
            <td>Uztur jūs pieteiktu. Obligāti nepieciešama; HttpOnly, tāpēc lapas skripti to nevar nolasīt</td>
            <td>Pārlūka sesija vai 30 dienas, ja izvēlējāties “Palikt pieteiktam”</td>
          </tr>
          <tr>
            <td>apex_signed_in</td>
            <td>Nekaitīgs karodziņš, kas ļauj mūsu publiskajām lapām rādīt “Vadības panelis”, nevis “Pieteikties”. Nesatur personas datus</td>
            <td>Tāpat kā sesija</td>
          </tr>
          <tr>
            <td>Valodas sīkdatne</td>
            <td>Atceras jūsu izvēlēto valodu</td>
            <td>1 gads</td>
          </tr>
          <tr>
            <td>apex_oauth</td>
            <td>Aizsargā notiekošu pieteikšanos ar Google vai GitHub. Vienreizēja</td>
            <td>10 minūtes</td>
          </tr>
        </tbody>
      </table>
      <p>
        Mēs neizmantojam reklāmas vai analītikas sīkdatnes. Tērzēšanas logrīks neiestata sīkdatnes; atkarībā no klienta
        iestatījumiem tas apmeklētāja pārlūkā glabā tikai pašreizējās sarunas ID (cilnei, pārlūkam vai nemaz). Kad darbojas
        Cloudflare Turnstile, tas sava uzdevuma veikšanai var izmantot savu krātuvi.
      </p>

      <h2 id="rights">Jūsu tiesības</h2>
      <p>
        Jūs varat lūgt informāciju par to, vai mēs apstrādājam jūsu datus, piekļūt tiem, tos labot, saņemt tos pārnesamā
        formātā, dzēst tos, ierobežot to izmantošanu vai iebilst pret to, kā arī atsaukt piekrišanu (VDAR un KVKK 11. pants).
      </p>
      <ul>
        <li>
          <strong>Dzēsiet kontu paši</strong> vadības paneļa sadaļā “Konta iestatījumi”. Tiks dzēsts jūsu konts un katra
          darbvieta, kurā bijāt vienīgais dalībnieks, kopā ar tās asistentiem, zināšanām un sarunām.
        </li>
        <li>
          <strong>Pārvaldiet savas sesijas</strong>: iestatījumos mainiet paroli un izrakstieties visās pārējās ierīcēs.
        </li>
        <li>
          <strong>Apmeklētājiem</strong>, lai apskatītu vai dzēstu savu sarunu, jāsazinās ar vietni, kurā viņi sarunājās; mēs
          palīdzam šim klientam atbildēt.
        </li>
        <li>
          Visos citos jautājumos, tostarp, lai saņemtu savu datu kopiju, rakstiet uz{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Mēs atbildam 30 dienu laikā. Pirms rīkoties, mēs varam lūgt
          apstiprināt jūsu identitāti.
        </li>
      </ul>
      <p>
        Jūs varat arī iesniegt sūdzību datu aizsardzības uzraudzības iestādei (Latvijā – Datu valsts inspekcijai, citās ES
        valstīs – savas valsts iestādei, Turcijā – Personas datu aizsardzības iestādei, KVKK).
      </p>

      <h2 id="customers">Ja esat klients: jūsu pienākumi</h2>
      <p>
        Jūs esat savu apmeklētāju datu pārzinis. Tas nozīmē, ka jūs nosakāt, ko asistents vāc, jums tam vajadzīgs likumīgs
        pamats, un jums jāsniedz apmeklētājiem paziņojumi, ko pieprasa VDAR, KVKK vai līdzīgi tiesību akti (logrīks var rādīt
        brīdinājuma rindiņu ar saitēm uz jūsu pašu politiku). Izvēlieties glabāšanas periodu, kas atbilst tam, ko viņiem
        paziņojat. Ja mums jautās par apmeklētāja datiem, mēs viņu novirzīsim pie jums un palīdzēsim jums atbildēt. Tas ir
        aplūkots arī mūsu <a href="/lv/terms">pakalpojuma noteikumos</a>.
      </p>

      <h2 id="security">Drošība</h2>
      <p>
        Dati tiek šifrēti pārsūtīšanas laikā, piekļuve ir ierobežota katrai darbvietai, paroles tiek glabātas kā scrypt
        jaucējkodi, un asistents atbild tikai jūsu atļautajās vietnēs. Sīkāk tas paskaidrots{" "}
        <a href="/lv/security">drošības lapā</a>. Neviena sistēma nav pilnīgi droša; ja datu drošības pārkāpums skars jūs, mēs
        paziņosim jums un iestādēm, kā to pieprasa likums.
      </p>

      <h2 id="children">Bērni</h2>
      <p>
        Apex ir paredzēts uzņēmumiem un pieaugušajiem. Mēs apzināti nevācam datus no bērniem, kas jaunāki par 16 gadiem, konta
        uzturēšanai. Ja domājat, ka bērns mums ir sniedzis datus, sazinieties ar mums, un mēs tos dzēsīsim.
      </p>

      <h2 id="changes">Izmaiņas un kontakti</h2>
      <p>
        Mēs atjaunināsim šo lapu, mainoties produktam, un par būtiskām izmaiņām paziņosim kontu īpašniekiem pirms to
        stāšanās spēkā. Pēdējo izmaiņu datums norādīts augšpusē. Jautājumi vai pieprasījumi:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Juridiskā informācija",
  title: "Privātuma politika",
  intro: `Versija ${TERMS_VERSION}. Ko mēs vācam, kāpēc, kas vēl to redz, cik ilgi mēs to glabājam un kādas izvēles jums ir. Sagatavota atbilstoši VDAR (ES) un KVKK (Turcija) prasībām.`,
  toc: [
    { id: "who", label: "Uz ko tā attiecas" },
    { id: "collect", label: "Ko mēs vācam" },
    { id: "use", label: "Kā mēs izmantojam datus" },
    { id: "providers", label: "Kas vēl apstrādā datus" },
    { id: "training", label: "Modeļu apmācība" },
    { id: "retention", label: "Cik ilgi glabājam datus" },
    { id: "cookies", label: "Sīkdatnes un krātuve" },
    { id: "rights", label: "Jūsu tiesības" },
    { id: "customers", label: "Ja esat klients" },
    { id: "security", label: "Drošība" },
    { id: "children", label: "Bērni" },
    { id: "changes", label: "Izmaiņas un kontakti" },
  ],
  body: Body,
};
