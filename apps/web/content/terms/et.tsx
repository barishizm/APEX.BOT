import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2>1. Teenus</h2>
      <p>
        Apex Bot („Apex“, „meie“) pakub tehisintellektil põhinevat assistenti, mis vastab teie veebisaidi külastajate
        küsimustele teie esitatud sisu põhjal, ning töölauda selle seadistamiseks. Praegu on Apex beetaversioonis: funktsioonid
        võivad muutuda ning teenust täiustades võime juurdepääsu piirata või ajutiselt peatada.
      </p>

      <h2>2. Teie konto</h2>
      <ul>
        <li>Registreerumisel peate esitama õiget teavet ja hoidma oma parooli turvaliselt.</li>
        <li>Vastutate oma tööruumis toimuva eest, sealhulgas teie kutsutud meeskonnaliikmete tegevuse eest.</li>
        <li>
          Peate olema piisavalt vana, et oma elukohariigi õiguse kohaselt siduvat lepingut sõlmida, ning ettevõttena
          registreerudes tegutsema oma ettevõtte nimel.
        </li>
      </ul>

      <h2>3. Teie sisu ja teie veebisait</h2>
      <p>
        Teile jäävad kõik õigused sisule, mille Apexile annate (veebisaidi lehed, tekst, seaded), ja vestlustele teie
        veebisaidil. Annate meile loa seda säilitada ja töödelda ainult selleks, et teile teenust osutada. Kinnitate, et teil
        on õigus seda sisu kasutada ja et Apex võib lugeda veebisaite, millele selle suunate.
      </p>

      <h2>4. TI loodud vastused</h2>
      <p>
        Vastused loovad teie sisu põhjal kolmandate osapoolte TI mudelid. Need võivad olla puudulikud või valed. Apex näitab
        külastajatele, et nad suhtlevad TI-ga, ning teie vastutate jätkuvalt oma veebisaidil oleva teabe ja selle põhjal tehtud
        otsuste eest. Ärge tuginege assistendile meditsiiniliste, õiguslike ega finantsnõuannete saamisel.
      </p>

      <h2>5. Lubatud kasutus</h2>
      <p>Nõustute mitte kasutama Apexit selleks, et:</p>
      <ul>
        <li>rikkuda seadust või teiste õigusi või eksitada külastajaid selles, kellega nad suhtlevad;</li>
        <li>
          koguda delikaatseid isikuandmeid ilma õigusliku aluseta ja ilma teavitusteta, mida nõuavad isikuandmete kaitse
          üldmäärus (GDPR), KVKK või sarnased seadused;
        </li>
        <li>rünnata teenust, seda üle koormata või pöördprojekteerida või mööda hiilida selle kasutuspiirangutest või turvameetmetest.</li>
      </ul>

      <h2>6. Privaatsus</h2>
      <p>
        Meie <a href="/et/privacy">privaatsuspoliitikas</a> selgitatakse, kuidas me isikuandmeid töötleme. Kui teie külastajad
        teie assistendiga vestlevad, olete nende andmete vastutav töötleja ja meie töötleme neid teie nimel.
      </p>

      <h2>7. Tasud</h2>
      <p>
        Beetaversiooni ajal on Apex tasuta. Enne tasuliste pakettide kehtima hakkamist anname teile sellest eelnevalt teada ja
        saate otsustada, kas jätkata.
      </p>

      <h2>8. Kasutamise lõpetamine</h2>
      <p>
        Võite Apexi kasutamise igal ajal lõpetada, eemaldades vidina oma saidilt ja paludes meil oma konto kustutada. Võime
        peatada kontod, mis rikuvad neid tingimusi või ohustavad teenust või teisi kliente.
      </p>

      <h2>9. Vastutus</h2>
      <p>
        Beetaversiooni ajal osutatakse teenust „nagu on“. Seadusega lubatud ulatuses ei vastuta me kaudse ega tegevuse
        tagajärjel tekkinud kahju eest ning meie koguvastutus on piiratud summaga, mille maksite meile nõude esitamisele
        eelnenud kaheteistkümne kuu jooksul.
      </p>

      <h2>10. Muudatused ja kontakt</h2>
      <p>
        Võime neid tingimusi uuendada; olulistest muudatustest teavitame teid enne nende jõustumist. Küsimused:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const terms: ProseContent = {
  eyebrow: "Õigusteave",
  title: "Kasutustingimused",
  intro: `Versioon ${TERMS_VERSION}. Neid tingimusi kohaldatakse Apex Boti kasutamisele, sealhulgas töölauale ja vestlusvidinale, mille oma veebisaidile paigaldate.`,
  body: Body,
};
