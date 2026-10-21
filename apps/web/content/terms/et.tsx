import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { billingTerms } from "../legal";
import type { ProseContent } from "../types";

const PRICING = "/et/pricing";
const PADDLE_TERMS = "https://www.paddle.com/legal/checkout-buyer-terms";

function Body() {
  const n = billingTerms("et");
  return (
    <>
      <h2>1. Teenus</h2>
      <p>
        Apex Bot („Apex“, „meie“) pakub tehisintellektil põhinevat assistenti, mis vastab teie veebisaidi külastajate
        küsimustele teie esitatud sisu põhjal, ning töölauda selle seadistamiseks. Teenust täiustades võivad funktsioonid muutuda
        ning seni, kuni Apex on beetaversioonis, võime juurdepääsu piirata või ajutiselt peatada.
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

      <h2>7. Paketid ja tasud</h2>
      <p>
        Apexil on tasuta pakett ja tasulised paketid (Starter, Pro ja Business), mille tehisintellekti vastused, veebisaidid
        ja funktsioonid on toodud <a href={PRICING}>hinnalehel</a>. Tasuliste pakettide eest makstakse ette, kord kuus või kord
        aastas, USA dollarites.
      </p>
      <p>
        Beetaversiooni ajal on Apex tasuta. Tasulised paketid hakkavad kehtima käivituskuupäeval, millest anname e-posti teel
        teada vähemalt {n.noticeDays} päeva ette. Käivitamisel saab iga beetatööruum {n.betaDays} päevaks tasuta ja ilma
        kaardita tasulise paketi, mis katab tema hiljutise kasutuse; kui te selle aja jooksul ei telli, läheb tööruum seejärel
        üle tasuta paketile. Väiksemale paketile üleminek ei kustuta midagi: piiri ületavad veebisaidid peatatakse ja kõrgema
        paketi funktsioone ei rakendata, kuni valite taas suurema paketi.
      </p>

      <h2>8. Maksmine Paddle'i kaudu</h2>
      <p>
        Meie tellimisprotsessi viib läbi meie veebipõhine edasimüüja Paddle.com. Paddle.com on kõigi meie tellimuste müüja
        (Merchant of Record): Paddle müüb teile tellimuse, võtab vastu makse, väljastab arve ning tegeleb arveldusküsimuste ja
        tagasimaksetega oma <a href={PADDLE_TERMS}>ostjatingimuste</a> alusel. Teie kaardi- või muud makseandmed lähevad
        Paddle'ile, mitte meile. Apexi enda kasutamise suhtes kehtivad jätkuvalt need tingimused.
      </p>

      <h2>9. Maksud</h2>
      <p>
        Hinnalehel toodud hinnad ei sisalda makse. Müüjana arvutab Paddle teie asukohas kehtiva käibemaksu, müügimaksu või
        GST, lisab selle maksmisel ja tasub maksuasutustele. Kui ostate ettevõtte jaoks ja esitate kehtiva käibemaksukohustuslase
        numbri, võidakse selle asemel rakendada pöördmaksustamist. Paddle'i arvel on näidatud arvestatud maks.
      </p>

      <h2>10. Pikendamine, muutmine ja tühistamine</h2>
      <ul>
        <li>
          Tellimus pikeneb automaatselt iga kuu- või aastaperioodi lõpus ja Paddle võtab makse salvestatud makseviisilt, kuni
          te tellimuse tühistate.
        </li>
        <li>
          Suuremale paketile üleminek kehtib kohe ja perioodi ülejäänud aja eest maksate vahe. Väiksemale paketile üleminek
          kehtib makstud perioodi lõpus. Aastaselt arveldamiselt kuisele üleminek kehtib kohe ning kasutamata aeg kantakse teie
          Paddle'i saldole.
        </li>
        <li>
          Tellimuse saate igal ajal tühistada töölaual jaotises Seaded → Arveldus. Pakett kehtib makstud perioodi lõpuni ega
          pikene; pärast seda on tööruum tasuta paketil.
        </li>
        <li>
          Kui makse ebaõnnestub, säilitab tööruum oma paketi {n.graceDays} päeva, mil makset uuesti proovitakse. Kui makse ka
          siis ei õnnestu, läheb tööruum üle tasuta paketile.
        </li>
        <li>
          Anname hinnamuutusest teada vähemalt {n.noticeDays} päeva enne, kui see teie tellimust mõjutab. See kehtib järgmisest
          pikendamisest alates ja enne seda saate tellimuse tühistada.
        </li>
      </ul>

      <h2>11. Tagasimaksed</h2>
      <p>
        Kui Apex teile ei sobi, võite {n.refundDays} päeva jooksul pärast makset paluda tellimuse esimese makse või aastase
        pikenduse makse täielikku tagastamist. Muid makseid, sealhulgas kuiseid pikendusi, perioodi ülejäänud osa pärast
        tühistamist ja juba kasutatud lisavastuseid, ei tagastata, välja arvatud arveldusvea korral või kui seadus annab teile
        selleks õiguse (näiteks tarbija taganemisõigus). Tagasimakse teeb Paddle algsele makseviisile; taotlege seda Paddle'i
        kviitungil oleva lingi kaudu või meile e-kirja saates.
      </p>

      <h2>12. Lisavastused</h2>
      <p>
        Iga pakett sisaldab kindlat arvu tehisintellekti vastuseid kuuperioodis; kiire mudeli vastus loetakse viiendikuks,
        Claude Opus 5.5 vastus kaheks ja Claude Fable 5.1 vastus viieks. Kui need saavad otsa, pakub assistent vastamise asemel
        üleandmisvormi ja rohkem tasu ei võeta. Tasulisel paketil saate arveldusseadetes lisavastused sisse lülitada: need
        maksavad {n.blockPrice} {n.blockReplies} vastuse kohta, kasutatakse tervete plokkidena kuni teie määratud kuise
        piirmäärani. Paddle võtab nende eest tasu tellimuse makseviisilt iga kuuperioodi lõpus, kunagi üle teie piirmäära.
        Saate need igal ajal välja lülitada või piirmäära muuta; muudatus kehtib sellest hetkest.
      </p>

      <h2>13. Kasutamise lõpetamine</h2>
      <p>
        Võite Apexi kasutamise igal ajal lõpetada, eemaldades vidina oma saidilt ja paludes meil oma konto kustutada. Võime
        peatada kontod, mis rikuvad neid tingimusi või ohustavad teenust või teisi kliente.
      </p>

      <h2>14. Vastutus</h2>
      <p>
        Beetaversiooni ajal osutatakse teenust „nagu on“. Seadusega lubatud ulatuses ei vastuta me kaudse ega tegevuse
        tagajärjel tekkinud kahju eest ning meie koguvastutus on piiratud summaga, mille maksite meile nõude esitamisele
        eelnenud kaheteistkümne kuu jooksul.
      </p>

      <h2>15. Muudatused ja kontakt</h2>
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
