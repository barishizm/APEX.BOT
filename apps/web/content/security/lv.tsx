import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="overview">Īsumā</h2>
      <p>
        Tērzēšanas robots jūsu vietnē ir publisks, tāpēc mēs veidojām Apex, pieņemot, ka kāds mēģinās to izmantot ļaunprātīgi:
        palielināt jūsu rēķinu, likt tam pateikt to, ko nevajadzētu, nolasīt cita klienta datus vai pārņemt kontu. Šeit
        aprakstītas aizsardzības, kas ir ieslēgtas pēc noklusējuma. Šajā lapā aprakstīts, ko produkts dara šodien, nevis
        nākotnes ieceres.
      </p>

      <h2 id="widget">Jūsu vietne un tērzēšanas logrīks</h2>
      <ul>
        <li>
          <strong>Darbojas tikai jūsu vietnēs.</strong> Katram asistentam ir publiska vietnes atslēga, taču tērzēšanas API to
          pieņem tikai no jūsu norādītajām vietnēm. Pieprasījumi no jebkuras citas izcelsmes tiek noraidīti, tāpat kā pārlūka
          iepriekšējās pārbaudes (pre-flight), tāpēc nokopēts iegulšanas kods citur neko nedara. Vietnes atslēga nav noslēpums
          un nedod piekļuvi jūsu kontam.
        </li>
        <li>
          <strong>Izolēts no jūsu lapas.</strong> Logrīks tiek attēlots Shadow DOM vidē, tāpēc jūsu vietnes CSS to nevar
          sabojāt, un tas nelasa jūsu lapu.
        </li>
        <li>
          <strong>Nekādu sīkdatņu, nekādas izsekošanas.</strong> Logrīks neiestata sīkdatnes un trešo pušu izsekotājus. Atkarībā
          no jūsu iestatījuma tas atceras tikai sarunas ID – cilnei, pārlūkam vai nemaz.
        </li>
        <li>
          <strong>Tikai nelieli pieprasījumi.</strong> Katrs pieprasījums ir ierobežots līdz 16 KB, ziņu garums ir ierobežots
          (pēc noklusējuma 1000 rakstzīmes, maināms), un sarunai ir maksimālais garums.
        </li>
        <li>
          <strong>Atbildes netiek kešotas</strong> un tiek sūtītas ar <code>nosniff</code>, tāpēc pārlūks vai CDN nevar saglabāt
          vai citādi interpretēt apmeklētāja sarunu.
        </li>
      </ul>

      <h2 id="ai">MI drošība</h2>
      <ul>
        <li>
          <strong>Atbildes nāk no jūsu satura.</strong> Asistentam ir norādīts atbildēt tikai ar faktiem, kas atrodami lapās un
          tekstā, ko sniedzāt Apex, nekad neizdomāt cenas, noteikumus vai kontaktinformāciju un pateikt, ka nezina, ja nekas
          būtisks nav atrasts. Kad tas nezina, tas var piedāvāt nodot sarunu jūsu komandai.
        </li>
        <li>
          <strong>Aizsargāts pret uzvedņu injekcijām.</strong> Apmeklētāju ziņas, jūsu vietnes teksts un jūsu pielāgotie
          norādījumi tiek nodoti modelim kā dati skaidri iezīmētās sadaļās, un noteiktie drošības noteikumi ir pirmie un tos
          nevar atcelt. Teksts, kas atdarina mūsu sadaļu marķierus, tiek neitralizēts, pirms tas sasniedz modeli. Jūsu
          norādījumi var veidot toni un tēmas, bet nevar izslēgt pamatotību vai drošību.
        </li>
        <li>
          <strong>Nekādu rīku, nekādu darbību.</strong> Asistents nevar veikt pasūtījumus, mainīt kontus, izpildīt kodu, pārlūkot
          tīmekli vai sazināties ar citām sistēmām. Sliktākais, ko var izdarīt veiksmīga manipulācija, ir mainīt to, ko saka
          viena saruna.
        </li>
        <li>
          <strong>Godīgi atzīst, ka ir MI</strong>, un nesniedz galīgus medicīniskus, juridiskus vai finanšu padomus. Varat arī
          uzskaitīt tēmas, par kurām tam pieklājīgi jāatsakās runāt.
        </li>
        <li>
          <strong>Izolēts katram klientam.</strong> Meklēšana notiek tikai tā asistenta saturā, kuram jautā, tāpēc viena klienta
          zināšanas nekad netiek izmantotas, lai atbildētu cita klienta vietnē.
        </li>
      </ul>

      <h2 id="abuse">Aizsardzība pret ļaunprātīgu izmantošanu un izmaksām</h2>
      <ul>
        <li>
          <strong>Pieprasījumu ierobežojums katram apmeklētājam</strong>: pēc noklusējuma 15 ziņas minūtē vienam apmeklētājam,
          maināms katram asistentam (no 1 līdz 120), kā arī kopējais asistenta ierobežojums, tāpēc viena persona vai skripts
          nevar iztērēt jūsu limitu.
        </li>
        <li>
          <strong>Dienas tokenu budžets</strong> katram asistentam (pēc noklusējuma 2 miljoni, līdz 20 miljoniem), kas tiek
          skaitīts datubāzē, tāpēc saglabājas arī pēc restartēšanas. Kad tas ir iztērēts, asistents līdz nākamajai dienai pēc
          UTC vairs neatbild, nevis palielina izmaksas.
        </li>
        <li>
          <strong>E-pastu nevar izmantot kā surogātpasta lielgabalu.</strong> Nodošanas pieprasījumi ir ierobežoti katram
          apmeklētājam, asistentam un saņēmējam – stundā un dienā. Nodošanas adrese jāapstiprina ar uz to nosūtītu kodu, pirms
          mēs uz to kaut ko sūtām, tāpēc neviens nevar novirzīt sistēmu uz sveša cilvēka pastkastīti.
        </li>
        <li>
          <strong>Robotu pārbaude.</strong> Reģistrāciju, pieteikšanos un paroles atiestatīšanu aizsargā
          Cloudflare Turnstile. Ja pārbaudi nevar pabeigt, pieprasījums tiek noraidīts, nevis atļauts.
        </li>
      </ul>

      <h2 id="accounts">Konti un pieteikšanās</h2>
      <ul>
        <li>
          <strong>Paroles</strong> netiek glabātas nekad; tiek glabāts tikai sālīts scrypt jaucējkods (apzināti lēna, daudz
          atmiņas prasoša funkcija). Minimālais garums ir 8 rakstzīmes. Jaucējkodus vēlāk var pastiprināt, nevienam nebloķējot
          piekļuvi.
        </li>
        <li>
          <strong>E-pasta apstiprināšana</strong> ir obligāta, pirms tiek atvērts vadības panelis. Kodi ir sešciparu, derīgi
          15 minūtes, glabāti tikai kā jaucējkods, bloķēti pēc 5 nepareiziem mēģinājumiem, un to pieprasīšanas un minēšanas
          biežums stundā ir ierobežots.
        </li>
        <li>
          <strong>Aizsardzība pret paroļu uzlaušanu.</strong> Neveiksmīgas pieteikšanās tiek skaitītas pēc e-pasta adreses, IP
          adreses un to kombinācijas, un turpmākie mēģinājumi tiek bloķēti uz 15 minūtēm. Nezināmas e-pasta adreses noraidīšana
          aizņem tikpat ilgu laiku kā nepareizas paroles noraidīšana, un kļūdas ziņojums ir tāds pats, tāpēc forma neatklāj,
          kurām adresēm ir konti.
        </li>
        <li>
          <strong>Sesijas.</strong> Sīkdatnē tiek glabāts nejaušs 256 bitu marķieris; mūsu datubāzē tiek glabāts tikai tā SHA-256
          jaucējkods, tāpēc datubāzes noplūde neatklāj aktīvas sesijas. Sīkdatne ir HttpOnly (skripti to nevar nolasīt), Secure
          (tikai HTTPS) un SameSite=Lax. Sesija ilgst 24 stundas vai 30 dienas, ja izvēlaties “Palikt pieteiktam”.
        </li>
        <li>
          <strong>Kontrole paliek jūsu rokās.</strong> Paroles maiņa vai atiestatīšana izraksta jūs visās pārējās ierīcēs. Jūs
          varat arī iestatījumos izrakstīties visās pārējās ierīcēs un redzēt, cik no tām ir aktīvas.
        </li>
        <li>
          <strong>Pieteikšanās ar Google un GitHub</strong> izmanto vienreizēju stāvokļa vērtību (un Google gadījumā arī PKCE).
          Mēs pieņemam tikai tādu e-pasta adresi, ko pakalpojuma sniedzējs norāda kā apstiprinātu, tāpēc neviens nevar piesavināties
          adresi, kas tam nepieder.
        </li>
        <li>
          <strong>Drošības žurnāls.</strong> Pieteikšanās, neveiksmes, atiestatīšanas un paroļu maiņas tiek reģistrētas ar laiku,
          IP adresi un pārlūku, lai incidentu varētu izmeklēt.
        </li>
        <li>
          <strong>Kontu varat dzēst</strong> paši, apstiprinot to ar savas e-pasta adreses ievadīšanu. Kopā ar to tiek dzēstas
          darbvietas, kurās esat vienīgais dalībnieks.
        </li>
      </ul>

      <h2 id="data">Jūsu datu aizsardzība</h2>
      <ul>
        <li>
          <strong>Šifrēšana pārsūtīšanas laikā.</strong> Katrs savienojums ar vietni, vadības paneli un tērzēšanas API izmanto
          HTTPS ar HSTS (uz diviem gadiem, ieskaitot apakšdomēnus), tāpēc pārlūki nekad neatgriežas pie nešifrēta HTTP.
          Savienojums ar datubāzi ir šifrēts, un tērzēšanas API pārbauda datubāzes sertifikātu.
        </li>
        <li>
          <strong>Katra darbvieta ir nošķirta.</strong> Vadības paneļa vaicājumi vienmēr ir ierobežoti ar pieteiktā lietotāja
          darbvietu. Katrā datubāzes tabulā ir ieslēgta rindu līmeņa drošība bez publiskām politikām, tāpēc datubāzes publiskā
          REST saskarne neko nevar nolasīt; to var tikai mūsu serveri ar saviem akreditācijas datiem.
        </li>
        <li>
          <strong>Kodi un marķieri tiek glabāti kā jaucējkodi</strong>, nevis lasāmā veidā: sesiju marķieri, apstiprinājuma un
          paroles atiestatīšanas kodi, kā arī nodošanas apstiprinājuma kodi.
        </li>
        <li>
          <strong>Personas dati nenonāk žurnālos.</strong> E-pasta adreses, tālruņu numuri, karšu numuri (pārbaudīti ar Luhn
          algoritmu) un Turcijas, Lietuvas, Latvijas un Igaunijas IBAN numuri tiek maskēti, pirms mūsu lietotņu žurnālos kaut
          kas tiek ierakstīts.
        </li>
        <li>
          <strong>Glabāšanas ilgumu nosakāt jūs.</strong> Sarunas tiek automātiski dzēstas pēc jūsu izvēlētā perioda (no 1 līdz
          365 dienām, pēc noklusējuma 30), un jebkuru no tām varat dzēst paši vadības panelī.
        </li>
        <li>
          <strong>Apmācība – tikai ar piekrišanu.</strong> Jūsu saturu savu modeļu uzlabošanai izmantojam tikai tad, ja esat
          piekrituši, un šo izvēli varat mainīt jebkurā laikā. Google bezmaksas līmenim, kurā darbojas mūsu meklēšana, ir savi
          noteikumi: skatiet <a href="/lv/privacy">privātuma politiku</a>.
        </li>
        <li>
          <strong>Mitināts ES tur, kur tas ir svarīgi.</strong> Tērzēšanas API darbojas Frankfurtē, Vācijā. Visi datus apstrādājošie
          pakalpojumu sniedzēji ir norādīti <a href="/lv/privacy#providers">privātuma politikā</a>.
        </li>
      </ul>

      <h2 id="crawler">Droša jūsu vietnes lasīšana</h2>
      <p>
        Kad sniedzat Apex URL, mūsu rāpuļprogramma to ielādē jūsu vārdā. Tā kā URL ievadāt jūs, mēs to uzskatām par neuzticamiem
        ievades datiem, lai to nevarētu izmantot mūsu iekšējā tīkla sasniegšanai:
      </p>
      <ul>
        <li>Tikai <code>http</code> un <code>https</code> standarta portos (80 un 443); nekādu URL ar iegultiem akreditācijas datiem.</li>
        <li>
          Tikai publiskas adreses. Privātie, atgriezeniskās saites (loopback), lokālās saites (link-local) un rezervētie diapazoni
          tiek bloķēti, ieskaitot to IPv6 un uz IPv4 kartētās formas, un pārbaude notiek adresei, ar kuru faktiski tiek
          izveidots savienojums, kas novērš DNS atkārtotas piesaistes (DNS rebinding) trikus. Lokālie resursdatoru nosaukumi,
          piemēram, <code>localhost</code>, <code>.local</code> un <code>.internal</code>, tiek noraidīti.
        </li>
        <li>Katra novirzīšana tiek pārbaudīta no jauna, ne vairāk kā 5 lēcieni. Laiks un izmērs ir ierobežoti, arī pēc atspiešanas, lai apturētu “zip bumbas”.</li>
        <li>
          Tā identificē sevi kā <code>ApexBot</code> un ievēro vietnes <code>robots.txt</code>.
        </li>
      </ul>

      <h2 id="headers">Pārlūka aizsardzība</h2>
      <p>Vadības panelis un vietne katrā lapā sūta šādas drošības galvenes:</p>
      <ul>
        <li><code>X-Frame-Options: DENY</code> un <code>frame-ancestors 'none'</code>, lai vadības paneli nevarētu ievietot rāmī klikšķu nolaupīšanai.</li>
        <li><code>Strict-Transport-Security</code> uz diviem gadiem, ieskaitot apakšdomēnus.</li>
        <li><code>X-Content-Type-Options: nosniff</code> un stingra atsauces (referrer) politika.</li>
        <li><code>object-src 'none'</code> un <code>base-uri 'self'</code> satura drošības politikā.</li>
        <li>Atļauju politika, kas atspējo kameru, mikrofonu un atrašanās vietu.</li>
      </ul>
      <p>
        API pieņem tikai JSON saturu, ko citas vietnes forma nevar nosūtīt bez iepriekšējās pārbaudes, un servera
        identifikācijas galvene netiek atklāta.
      </p>

      <h2 id="development">Kā mēs to veidojam un uzturam</h2>
      <ul>
        <li>Kodam, kas apstrādā pieteikšanos, meklēšanu, pieprasījumu ierobežojumus, rāpuļprogrammu un datu maskēšanu, ir automatizēti testi.</li>
        <li>Noslēpumi (API atslēgas, datubāzes akreditācijas dati) tiek glabāti mitināšanas pakalpojumu sniedzēju noslēpumu krātuvēs, nevis kodā.</li>
        <li>Datubāzes izmaiņas ir versiju migrācijas, kas tiek piemērotas automātiski un ko var droši palaist atkārtoti.</li>
        <li>Pakalpojumu sniedzēji, uz kuriem paļaujamies, un tas, ko katrs saņem, ir uzskaitīti <a href="/lv/privacy#providers">privātuma politikā</a>.</li>
      </ul>

      <h2 id="shared">Ko varat darīt jūs</h2>
      <ul>
        <li>Norādiet tikai tās vietnes, kurās jārāda asistents, un pārskatiet sarakstu, kad mainās jūsu domēni.</li>
        <li>Izmantojiet spēcīgu, unikālu paroli vai pieteikšanos ar Google vai GitHub un izrakstieties ierīcēs, kuras vairs neizmantojat.</li>
        <li>Neiekļaujiet privātu informāciju lapās un tekstā, ko sniedzat Apex: pieņemiet, ka jebko no tā var citēt apmeklētājam.</li>
        <li>Iestatiet savai vietnei piemērotu glabāšanas periodu un dienas budžetu un izmantojiet nodošanas adresi, ko kontrolējat jūs.</li>
        <li>Informējiet apmeklētājus par to, kā apstrādājat viņu datus, kā to pieprasa VDAR un KVKK.</li>
      </ul>

      <h2 id="report">Ziņojiet par ievainojamību vai incidentu</h2>
      <p>
        Ja domājat, ka esat atraduši vājo vietu, vai kaut kas nav kārtībā ar jūsu kontu, rakstiet uz{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Sniedziet pietiekami daudz informācijas, lai problēmu varētu
        atkārtot. Lūdzu, dodiet mums saprātīgu iespēju to novērst, pirms to publiskojat, un nepiekļūstiet citu personu datiem,
        netraucējiet pakalpojumu un neveiciet automatizētu skenēšanu produkcijas vidē. Mēs apstiprināsim jūsu ziņojuma
        saņemšanu un informēsim jūs par gaitu.
      </p>
      <p>
        Neviena sistēma nav pilnīgi droša. Ja datu drošības pārkāpums skars jūsu datus, mēs paziņosim jums un iestādēm, kā to
        pieprasa likums. Par to, kā mēs apstrādājam personas datus, lasiet <a href="/lv/privacy">privātuma politikā</a>.
      </p>
    </>
  );
}

export const security: ProseContent = {
  eyebrow: "Uzticamība",
  title: "Drošība",
  intro: "Kā Apex aizsargā jūsu kontu, jūsu apmeklētāju sarunas un jūsu vietni. Kas ir ieslēgts pēc noklusējuma – vienkāršā valodā.",
  toc: [
    { id: "overview", label: "Īsumā" },
    { id: "widget", label: "Vietne un logrīks" },
    { id: "ai", label: "MI drošība" },
    { id: "abuse", label: "Aizsardzība pret ļaunprātīgu izmantošanu" },
    { id: "accounts", label: "Konti un pieteikšanās" },
    { id: "data", label: "Jūsu datu aizsardzība" },
    { id: "crawler", label: "Jūsu vietnes lasīšana" },
    { id: "headers", label: "Pārlūka aizsardzība" },
    { id: "development", label: "Kā mēs to veidojam un uzturam" },
    { id: "shared", label: "Ko varat darīt jūs" },
    { id: "report", label: "Ziņot par ievainojamību" },
  ],
  body: Body,
};
