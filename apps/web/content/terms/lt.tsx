import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2>1. Paslauga</h2>
      <p>
        Apex Bot („Apex“, „mes“) teikia dirbtinio intelekto asistentą, kuris atsako į jūsų svetainės lankytojų klausimus
        remdamasis jūsų pateiktu turiniu, kartu su valdymo skydeliu jam konfigūruoti. Šiuo metu Apex yra beta etape: funkcijos
        gali keistis, o tobulindami paslaugą galime apriboti arba laikinai sustabdyti prieigą.
      </p>

      <h2>2. Jūsų paskyra</h2>
      <ul>
        <li>Registruodamiesi turite pateikti teisingą informaciją ir saugoti savo slaptažodį.</li>
        <li>Atsakote už veiklą savo darbo srityje, įskaitant jūsų pakviestų komandos narių veiksmus.</li>
        <li>
          Turite būti pakankamo amžiaus, kad pagal jūsų gyvenamosios vietos teisę galėtumėte sudaryti privalomą sutartį, o
          registruodamiesi kaip verslas – veikti savo verslo vardu.
        </li>
      </ul>

      <h2>3. Jūsų turinys ir jūsų svetainė</h2>
      <p>
        Jums lieka visos teisės į turinį, kurį pateikiate Apex (svetainės puslapius, tekstą, nustatymus), ir į pokalbius jūsų
        svetainėje. Suteikiate mums leidimą jį saugoti ir tvarkyti tik tam, kad galėtume teikti jums paslaugą. Patvirtinate,
        kad turite teisę naudoti tą turinį ir kad Apex gali skaityti svetaines, kurias jam nurodote.
      </p>

      <h2>4. DI generuojami atsakymai</h2>
      <p>
        Atsakymus iš jūsų turinio generuoja trečiųjų šalių DI modeliai. Jie gali būti neišsamūs arba klaidingi. Apex rodo
        lankytojams, kad jie kalbasi su DI, o jūs ir toliau atsakote už informaciją savo svetainėje ir jos pagrindu priimtus
        sprendimus. Nesiremkite asistentu dėl medicininių, teisinių ar finansinių patarimų.
      </p>

      <h2>5. Priimtinas naudojimas</h2>
      <p>Įsipareigojate nenaudoti Apex tam, kad:</p>
      <ul>
        <li>pažeistumėte įstatymus, kitų asmenų teises arba klaidintumėte lankytojus dėl to, su kuo jie kalbasi;</li>
        <li>
          rinktumėte specialių kategorijų asmens duomenis neturėdami teisinio pagrindo ir nepateikę pranešimų, kurių reikalauja
          BDAR, KVKK ar panašūs įstatymai;
        </li>
        <li>atakuotumėte, perkrautumėte ar apgrąžos inžinerijos būdu tirtumėte paslaugą arba apeitumėte jos naudojimo ribas ar saugumo priemones.</li>
      </ul>

      <h2>6. Privatumas</h2>
      <p>
        Mūsų <a href="/lt/privacy">privatumo politikoje</a> paaiškinta, kaip tvarkome asmens duomenis. Kai jūsų lankytojai
        kalbasi su jūsų asistentu, jūs esate jų duomenų valdytojas, o mes juos tvarkome jūsų vardu.
      </p>

      <h2>7. Mokesčiai</h2>
      <p>
        Beta laikotarpiu Apex nemokamas. Prieš pradėdami taikyti mokamus planus, apie tai pranešime iš anksto, ir galėsite
        nuspręsti, ar tęsti.
      </p>

      <h2>8. Naudojimosi nutraukimas</h2>
      <p>
        Galite bet kada nustoti naudotis Apex, pašalinę valdiklį iš savo svetainės ir paprašę mūsų ištrinti jūsų paskyrą.
        Galime sustabdyti paskyras, kurios pažeidžia šias sąlygas arba kelia pavojų paslaugai ar kitiems klientams.
      </p>

      <h2>9. Atsakomybė</h2>
      <p>
        Beta laikotarpiu paslauga teikiama „tokia, kokia yra“. Kiek leidžia įstatymai, mes neatsakome už netiesioginius ar
        pasekminius nuostolius, o mūsų bendra atsakomybė neviršija sumos, kurią sumokėjote mums per dvylika mėnesių iki
        reikalavimo pateikimo.
      </p>

      <h2>10. Pakeitimai ir kontaktai</h2>
      <p>
        Šias sąlygas galime atnaujinti; apie esminius pakeitimus pranešime prieš jiems įsigaliojant. Klausimai:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const terms: ProseContent = {
  eyebrow: "Teisinė informacija",
  title: "Paslaugų teikimo sąlygos",
  intro: `Versija ${TERMS_VERSION}. Šios sąlygos taikomos jums naudojantis Apex Bot, įskaitant valdymo skydelį ir pokalbių valdiklį, kurį įdiegiate savo svetainėje.`,
  body: Body,
};
