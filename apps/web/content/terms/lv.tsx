import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2>1. Pakalpojums</h2>
      <p>
        Apex Bot (“Apex”, “mēs”) nodrošina mākslīgā intelekta asistentu, kas atbild uz jūsu vietnes apmeklētāju jautājumiem,
        izmantojot jūsu sniegto saturu, kopā ar vadības paneli tā konfigurēšanai. Pašlaik Apex ir beta versijā: funkcijas var
        mainīties, un, uzlabojot pakalpojumu, mēs varam ierobežot vai uz laiku apturēt piekļuvi.
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

      <h2>7. Maksa</h2>
      <p>
        Beta versijas laikā Apex ir bez maksas. Pirms maksas plānu ieviešanas mēs jums par to paziņosim iepriekš, un jūs varēsiet
        izvēlēties, vai turpināt.
      </p>

      <h2>8. Lietošanas izbeigšana</h2>
      <p>
        Jūs jebkurā laikā varat pārtraukt Apex lietošanu, noņemot logrīku no savas vietnes un lūdzot mums dzēst jūsu kontu. Mēs
        varam apturēt kontus, kas pārkāpj šos noteikumus vai apdraud pakalpojumu vai citus klientus.
      </p>

      <h2>9. Atbildība</h2>
      <p>
        Beta versijas laikā pakalpojums tiek sniegts “tāds, kāds tas ir”. Ciktāl to pieļauj tiesību akti, mēs neatbildam par
        netiešiem vai izrietošiem zaudējumiem, un mūsu kopējā atbildība nepārsniedz summu, ko jūs mums samaksājāt divpadsmit
        mēnešos pirms prasības iesniegšanas.
      </p>

      <h2>10. Izmaiņas un kontakti</h2>
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
