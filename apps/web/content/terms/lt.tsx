import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { billingTerms } from "../legal";
import type { ProseContent } from "../types";

const PRICING = "/lt/pricing";
const PADDLE_TERMS = "https://www.paddle.com/legal/checkout-buyer-terms";

function Body() {
  const n = billingTerms("lt");
  return (
    <>
      <h2>1. Paslauga</h2>
      <p>
        Apex Bot („Apex“, „mes“) teikia dirbtinio intelekto asistentą, kuris atsako į jūsų svetainės lankytojų klausimus
        remdamasis jūsų pateiktu turiniu, kartu su valdymo skydeliu jam konfigūruoti. Tobulinant paslaugą funkcijos gali keistis,
        o kol Apex yra beta etape, galime apriboti arba laikinai sustabdyti prieigą.
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

      <h2>7. Planai ir mokesčiai</h2>
      <p>
        Apex turi nemokamą planą ir mokamus planus (Starter, Pro ir Business), kurių DI atsakymai, svetainės ir funkcijos
        nurodyti <a href={PRICING}>kainų puslapyje</a>. Už mokamus planus mokama iš anksto, kas mėnesį arba kas metus, JAV
        doleriais.
      </p>
      <p>
        Beta laikotarpiu Apex nemokamas. Mokami planai pradedami taikyti nuo paleidimo datos, apie kurią el. paštu pranešame
        ne vėliau kaip prieš {n.noticeDays} dienų. Paleidimo metu kiekviena beta darbo sritis {n.betaDays} dienų nemokamai ir
        be kortelės gauna mokamą planą, atitinkantį jos pastarojo meto naudojimą; jei iki tol neužsiprenumeruosite, po to ji
        pereis į nemokamą planą. Perėjus į mažesnį planą niekas neištrinama: ribą viršijančios svetainės pristabdomos, o
        aukštesnio plano funkcijos netaikomos, kol vėl pasirinksite didesnį planą.
      </p>

      <h2>8. Mokėjimas per Paddle</h2>
      <p>
        Mūsų užsakymų procesą vykdo mūsų internetinis perpardavėjas Paddle.com. Paddle.com yra visų mūsų užsakymų pardavėjas
        (Merchant of Record): Paddle parduoda jums prenumeratą, priima mokėjimą, išrašo sąskaitą faktūrą ir tvarko su
        atsiskaitymu susijusius klausimus bei grąžinimus pagal savo <a href={PADDLE_TERMS}>Pirkėjo sąlygas</a>. Jūsų kortelės
        ar kiti mokėjimo duomenys perduodami Paddle, o ne mums. Pats naudojimasis Apex ir toliau reglamentuojamas šiomis
        sąlygomis.
      </p>

      <h2>9. Mokesčiai valstybei</h2>
      <p>
        Kainų puslapyje nurodytos kainos be mokesčių. Kaip pardavėjas, Paddle apskaičiuoja jūsų vietoje taikomą PVM, pardavimo
        mokestį ar GST, prideda jį mokant ir sumoka mokesčių institucijoms. Jei perkate verslui ir nurodote galiojantį PVM
        mokėtojo kodą, vietoj to gali būti taikomas atvirkštinis apmokestinimas. Paddle sąskaitoje faktūroje nurodomas
        priskaičiuotas mokestis.
      </p>

      <h2>10. Atnaujinimas, pakeitimai ir atšaukimas</h2>
      <ul>
        <li>
          Prenumerata automatiškai atnaujinama kiekvieno mėnesio ar metų laikotarpio pabaigoje, o Paddle nuskaičiuoja
          mokėjimą iš išsaugoto mokėjimo būdo, kol prenumeratos neatšauksite.
        </li>
        <li>
          Didesnis planas pradedamas taikyti iš karto, o už likusią laikotarpio dalį sumokate skirtumą. Mažesnis planas
          pradedamas taikyti apmokėto laikotarpio pabaigoje. Perėjimas nuo metinio prie mėnesinio atsiskaitymo taikomas iš
          karto, o nepanaudotas laikas įskaitomas į jūsų Paddle balansą.
        </li>
        <li>
          Prenumeratą galite bet kada atšaukti valdymo skydelyje, skiltyje Nustatymai → Atsiskaitymas. Planas galioja iki
          apmokėto laikotarpio pabaigos ir nebeatnaujinamas; po to darbo sritis naudoja nemokamą planą.
        </li>
        <li>
          Jei mokėjimas nepavyksta, kol jis bandomas pakartotinai, darbo sritis {n.graceDays} dienas išlaiko savo planą. Jei
          mokėjimas vis tiek neįvyksta, darbo sritis pereina į nemokamą planą.
        </li>
        <li>
          Apie kainos pakeitimą pranešame ne vėliau kaip prieš {n.noticeDays} dienų iki jo taikymo jūsų prenumeratai. Jis
          taikomas nuo kito po to einančio atnaujinimo, o iki tol galite prenumeratą atšaukti.
        </li>
      </ul>

      <h2>11. Pinigų grąžinimas</h2>
      <p>
        Jei Apex jums netinka, per {n.refundDays} dienų nuo mokėjimo galite paprašyti grąžinti visą pirmąjį prenumeratos
        mokėjimą arba metinio atnaujinimo mokėjimą. Kiti mokėjimai, įskaitant mėnesinius atnaujinimus, likusią laikotarpio
        dalį po atšaukimo ir jau panaudotus papildomus atsakymus, negrąžinami, išskyrus atsiskaitymo klaidą ar atvejus, kai
        teisę į grąžinimą suteikia įstatymas (pavyzdžiui, vartotojo teisė atsisakyti sutarties). Pinigus į pradinį mokėjimo
        būdą grąžina Paddle; prašymą pateikite per nuorodą Paddle kvite arba el. paštu mums.
      </p>

      <h2>12. Papildomi atsakymai</h2>
      <p>
        Kiekvienas planas apima tam tikrą DI atsakymų skaičių per mėnesio laikotarpį; greito modelio atsakymas skaičiuojamas
        kaip penktadalis, Claude Opus 5.5 – kaip du, o Claude Fable 5.1 – kaip penki. Kai jie baigiasi, asistentas vietoj
        atsakymo pasiūlo perdavimo formą, ir daugiau niekas neapmokestinama. Turėdami mokamą planą, atsiskaitymo nustatymuose
        galite įjungti papildomus atsakymus: jie kainuoja {n.blockPrice} už {n.blockReplies} atsakymų, naudojami visais
        blokais iki jūsų nustatytos mėnesio ribos. Paddle juos nuskaičiuoja iš prenumeratos mokėjimo būdo kiekvieno mėnesio
        laikotarpio pabaigoje, niekada ne daugiau nei jūsų riba. Juos išjungti ar ribą pakeisti galite bet kada; pakeitimas
        taikomas nuo tada.
      </p>

      <h2>13. Naudojimosi nutraukimas</h2>
      <p>
        Galite bet kada nustoti naudotis Apex, pašalinę valdiklį iš savo svetainės ir paprašę mūsų ištrinti jūsų paskyrą.
        Galime sustabdyti paskyras, kurios pažeidžia šias sąlygas arba kelia pavojų paslaugai ar kitiems klientams.
      </p>

      <h2>14. Atsakomybė</h2>
      <p>
        Beta laikotarpiu paslauga teikiama „tokia, kokia yra“. Kiek leidžia įstatymai, mes neatsakome už netiesioginius ar
        pasekminius nuostolius, o mūsų bendra atsakomybė neviršija sumos, kurią sumokėjote mums per dvylika mėnesių iki
        reikalavimo pateikimo.
      </p>

      <h2>15. Pakeitimai ir kontaktai</h2>
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
