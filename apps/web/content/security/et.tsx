import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="overview">Lühidalt</h2>
      <p>
        Vestlusrobot teie veebisaidil on avalik, seega ehitasime Apexi eeldusel, et keegi üritab seda kuritarvitada: suurendada
        teie arvet, panna seda ütlema asju, mida ta ei peaks, lugeda teise kliendi andmeid või kontot üle võtta. Siin on
        kirjeldatud kaitsed, mis on vaikimisi sisse lülitatud. See leht kirjeldab, mida toode teeb täna, mitte tulevikuplaane.
      </p>

      <h2 id="widget">Teie veebisait ja vestlusvidin</h2>
      <ul>
        <li>
          <strong>Töötab ainult teie veebisaitidel.</strong> Igal assistendil on avalik saidivõti, kuid vestluse API aktsepteerib
          seda ainult teie loetletud veebisaitidelt. Päringud mis tahes muust päritolust lükatakse tagasi, nagu ka brauseri
          eelkontrollid (pre-flight), seega ei tee kopeeritud manustamiskood mujal midagi. Saidivõti pole saladus ega anna
          juurdepääsu teie kontole.
        </li>
        <li>
          <strong>Teie lehest eraldatud.</strong> Vidin kuvatakse Shadow DOM-is, seega ei saa teie saidi CSS seda lõhkuda ja see
          ei loe teie lehte.
        </li>
        <li>
          <strong>Küpsiseid ega jälgimist pole.</strong> Vidin ei salvesta küpsiseid ega kasuta kolmandate osapoolte jälgijaid.
          Sõltuvalt teie seadest jätab see meelde ainult vestluse ID – vahekaardi, brauseri jaoks või üldse mitte.
        </li>
        <li>
          <strong>Ainult väikesed päringud.</strong> Iga päring on piiratud 16 KB-ga, sõnumite pikkus on piiratud (vaikimisi
          1000 tähemärki, muudetav) ja vestlusel on maksimaalne pikkus.
        </li>
        <li>
          <strong>Vastuseid ei puhverdata</strong> ja need saadetakse päisega <code>nosniff</code>, seega ei saa brauser ega CDN
          külastaja vestlust säilitada ega teisiti tõlgendada.
        </li>
      </ul>

      <h2 id="ai">TI turvalisus</h2>
      <ul>
        <li>
          <strong>Vastused tulevad teie sisust.</strong> Assistendile on antud juhis vastata ainult faktidega, mis leiduvad
          Apexile antud lehtedel ja tekstis, mitte kunagi välja mõelda hindu, tingimusi ega kontaktandmeid ning öelda, et ei
          tea, kui midagi asjakohast ei leita. Kui see ei tea, saab see pakkuda vestluse üleandmist teie meeskonnale.
        </li>
        <li>
          <strong>Kaitstud viibasüstide eest.</strong> Külastajate sõnumid, teie veebisaidi tekst ja teie enda kohandatud juhised
          edastatakse mudelile andmetena selgelt märgistatud jaotistes ning kindlad turvareeglid tulevad esimesena ja neid ei
          saa tühistada. Meie jaotisemärgiseid jäljendav tekst neutraliseeritakse enne mudelini jõudmist. Teie juhised võivad
          kujundada tooni ja teemasid, kuid ei saa põhjendatust ega turvalisust välja lülitada.
        </li>
        <li>
          <strong>Tööriistu ega toiminguid pole.</strong> Assistent ei saa esitada tellimusi, muuta kontosid, käivitada koodi,
          veebis sirvida ega teisi süsteeme kasutada. Halvim, mida edukas manipuleerimine teha saab, on muuta seda, mida ütleb
          üks vestlus.
        </li>
        <li>
          <strong>Ütleb ausalt, et on TI</strong>, ega anna lõplikke meditsiinilisi, õiguslikke ega finantsnõuandeid. Saate ka
          loetleda teemad, millest see peab viisakalt keelduma.
        </li>
        <li>
          <strong>Iga klient on eraldatud.</strong> Otsing toimub ainult küsitava assistendi sisus, seega ei kasutata ühe kliendi
          teadmisi kunagi teise kliendi saidil vastamiseks.
        </li>
      </ul>

      <h2 id="abuse">Kaitse kuritarvitamise ja kulude eest</h2>
      <ul>
        <li>
          <strong>Külastajapõhine päringupiirang</strong>: vaikimisi 15 sõnumit minutis külastaja kohta, muudetav iga assistendi
          jaoks (1 kuni 120), lisaks assistendi üldine ülempiir, seega ei saa üks inimene ega skript teie limiiti tühjendada.
        </li>
        <li>
          <strong>Päevane tokenieelarve</strong> iga assistendi jaoks (vaikimisi 2 miljonit, kuni 20 miljonit), mida loetakse
          andmebaasis, seega säilib see ka taaskäivituste korral. Kui see on ära kasutatud, lõpetab assistent kulude
          kasvatamise asemel vastamise kuni järgmise UTC päevani.
        </li>
        <li>
          <strong>E-posti ei saa kasutada rämpsposti kahurina.</strong> Üleandmised on piiratud külastaja, assistendi ja saaja
          kohta – tunnis ja päevas. Üleandmisaadress tuleb kinnitada sellele saadetud koodiga, enne kui me sinna midagi saadame,
          seega ei saa keegi süsteemi võõra inimese postkasti suunata.
        </li>
        <li>
          <strong>Robotikontroll.</strong> Registreerumist, sisselogimist ja parooli lähtestamist kaitseb
          Cloudflare Turnstile. Kui kontrolli ei õnnestu lõpule viia, lükatakse päring tagasi, mitte ei lubata.
        </li>
      </ul>

      <h2 id="accounts">Kontod ja sisselogimine</h2>
      <ul>
        <li>
          <strong>Paroole</strong> ei salvestata kunagi; salvestatakse ainult soolaga scrypt-räsi (teadlikult aeglane ja palju
          mälu nõudev funktsioon). Minimaalne pikkus on 8 tähemärki. Räsisid saab hiljem tugevdada kedagi välja lukustamata.
        </li>
        <li>
          <strong>E-posti kinnitamine</strong> on kohustuslik enne töölaua avamist. Koodid on kuuekohalised, kehtivad 15
          minutit, salvestatakse ainult räsina, lukustatakse pärast 5 valet katset ning nende küsimise ja arvamise sagedus
          tunnis on piiratud.
        </li>
        <li>
          <strong>Kaitse jõurünnete eest.</strong> Ebaõnnestunud sisselogimised loetakse e-posti aadressi, IP-aadressi ja nende
          kombinatsiooni põhjal ning järgmised katsed lukustatakse 15 minutiks. Tundmatu e-posti aadressi tagasilükkamine võtab
          sama kaua aega kui vale parooli oma ja veateade on sama, seega ei paljasta vorm, millistel aadressidel on konto.
        </li>
        <li>
          <strong>Seansid.</strong> Küpsises hoitakse juhuslikku 256-bitist tõendit; meie andmebaas säilitab ainult selle SHA-256
          räsi, seega ei anna andmebaasi leke välja aktiivseid seansse. Küpsis on HttpOnly (skriptid ei saa seda lugeda),
          Secure (ainult HTTPS) ja SameSite=Lax. Seanss kestab 24 tundi või 30 päeva, kui valite „Jäta mind sisselogituks“.
        </li>
        <li>
          <strong>Kontroll jääb teile.</strong> Parooli muutmine või lähtestamine logib teid välja kõigist teistest seadmetest.
          Kõigist teistest seadmetest saate välja logida ka seadetes ja näha, mitu neist on aktiivsed.
        </li>
        <li>
          <strong>Google'i ja GitHubiga sisselogimine</strong> kasutab ühekordset olekuväärtust (ja Google'i puhul ka PKCE-d).
          Aktsepteerime ainult sellist e-posti aadressi, mille teenusepakkuja on kinnitatuks märkinud, seega ei saa keegi
          endale võtta aadressi, mis talle ei kuulu.
        </li>
        <li>
          <strong>Turvalogi.</strong> Sisselogimised, ebaõnnestumised, lähtestamised ja paroolimuudatused registreeritakse koos
          aja, IP-aadressi ja brauseriga, et intsidenti saaks uurida.
        </li>
        <li>
          <strong>Konto saate kustutada</strong> ise, kinnitades selle oma e-posti aadressi sisestamisega. Koos sellega
          kustutatakse tööruumid, mille ainus liige olete.
        </li>
      </ul>

      <h2 id="data">Teie andmete kaitse</h2>
      <ul>
        <li>
          <strong>Krüpteerimine edastamisel.</strong> Iga ühendus veebisaidi, töölaua ja vestluse API-ga kasutab HTTPS-i koos
          HSTS-iga (kaheks aastaks, sealhulgas alamdomeenid), seega ei lähe brauserid kunagi üle krüpteerimata HTTP-le. Ühendus
          andmebaasiga on krüpteeritud ja vestluse API kontrollib andmebaasi sertifikaati.
        </li>
        <li>
          <strong>Iga tööruum on eraldi.</strong> Töölaua päringud on alati piiratud sisseloginud kasutaja tööruumiga. Igas
          andmebaasi tabelis on lubatud reataseme turvalisus ilma avalike poliitikateta, seega ei saa andmebaasi avalik
          REST-liides midagi lugeda; seda saavad teha ainult meie serverid oma volitustega.
        </li>
        <li>
          <strong>Koodid ja tõendid salvestatakse räsidena</strong>, mitte loetaval kujul: seansitõendid, kinnitus- ja parooli
          lähtestamise koodid ning üleandmise kinnituskoodid.
        </li>
        <li>
          <strong>Isikuandmed logidesse ei jõua.</strong> E-posti aadressid, telefoninumbrid, kaardinumbrid (kontrollitud Luhni
          algoritmiga) ning Türgi, Leedu, Läti ja Eesti IBAN-id maskeeritakse enne, kui midagi meie rakenduse logidesse
          kirjutatakse.
        </li>
        <li>
          <strong>Säilitamisaja määrate teie.</strong> Vestlused kustutatakse automaatselt pärast teie valitud perioodi (1 kuni
          365 päeva, vaikimisi 30) ja töölaualt saate ükskõik millise neist ise kustutada.
        </li>
        <li>
          <strong>Treenimine ainult nõusolekul.</strong> Kasutame teie sisu oma mudelite täiustamiseks ainult siis, kui olete
          nõustunud, ja seda valikut saate igal ajal muuta.
        </li>
        <li>
          <strong>Majutatud ELis seal, kus see on oluline.</strong> Vestluse API töötab Saksamaal Frankfurdis. Kõik andmeid
          töötlevad teenusepakkujad on loetletud <a href="/et/privacy#providers">privaatsuspoliitikas</a>.
        </li>
      </ul>

      <h2 id="crawler">Teie veebisaidi turvaline lugemine</h2>
      <p>
        Kui annate Apexile URL-i, laadib meie roomaja selle teie nimel alla. Kuna URL-i sisestate teie, käsitleme seda
        ebausaldusväärse sisendina, et seda ei saaks kasutada meie sisevõrku jõudmiseks:
      </p>
      <ul>
        <li>Ainult <code>http</code> ja <code>https</code> standardportidel (80 ja 443); manustatud volitustega URL-e ei lubata.</li>
        <li>
          Ainult avalikud aadressid. Privaat-, tagasiside- (loopback), lingipõhised (link-local) ja reserveeritud vahemikud on
          blokeeritud, sealhulgas nende IPv6- ja IPv4-le vastendatud kujud, ning kontrollitakse aadressi, millega tegelikult
          ühendus luuakse, mis nurjab DNS-i ümbersidumise (DNS rebinding) nipid. Kohalikud hostinimed, nagu{" "}
          <code>localhost</code>, <code>.local</code> ja <code>.internal</code>, lükatakse tagasi.
        </li>
        <li>Iga ümbersuunamist kontrollitakse uuesti, kõige rohkem 5 hüpet. Aeg ja suurus on piiratud, ka pärast lahtipakkimist, et peatada „zip-pommid“.</li>
        <li>
          See tutvustab end nimega <code>ApexBot</code> ja järgib saidi faili <code>robots.txt</code>.
        </li>
      </ul>

      <h2 id="headers">Brauseri kaitsed</h2>
      <p>Töölaud ja veebisait saadavad igal lehel järgmisi turvapäiseid:</p>
      <ul>
        <li><code>X-Frame-Options: DENY</code> ja <code>frame-ancestors 'none'</code>, et töölauda ei saaks klõpsuröövi eesmärgil raami panna.</li>
        <li><code>Strict-Transport-Security</code> kaheks aastaks, sealhulgas alamdomeenid.</li>
        <li><code>X-Content-Type-Options: nosniff</code> ja range viitaja (referrer) poliitika.</li>
        <li><code>object-src 'none'</code> ja <code>base-uri 'self'</code> sisuturbepoliitikas.</li>
        <li>Õiguste poliitika, mis keelab kaamera, mikrofoni ja asukoha.</li>
      </ul>
      <p>
        API aktsepteerib ainult JSON-sisu, mida teise saidi vorm ei saa ilma eelkontrollita saata, ja serverit tuvastavat päist ei
        avaldata.
      </p>

      <h2 id="development">Kuidas me seda arendame ja käitame</h2>
      <ul>
        <li>Sisselogimist, otsingut, päringupiiranguid, roomajat ja andmete maskeerimist käsitleval koodil on automaattestid.</li>
        <li>Saladusi (API-võtmed, andmebaasi volitused) hoitakse majutusteenuse pakkujate saladuste hoidlates, mitte koodis.</li>
        <li>Andmebaasi muudatused on versioonitud migratsioonid, mida rakendatakse automaatselt ja mida saab turvaliselt uuesti käivitada.</li>
        <li>Teenusepakkujad, kellele tugineme, ja see, mida igaüks saab, on loetletud <a href="/et/privacy#providers">privaatsuspoliitikas</a>.</li>
      </ul>

      <h2 id="shared">Mida saate teha teie</h2>
      <ul>
        <li>Loetlege ainult need veebisaidid, kus assistenti peab näitama, ja vaadake nimekiri üle, kui teie domeenid muutuvad.</li>
        <li>Kasutage tugevat ja unikaalset parooli või Google'i või GitHubiga sisselogimist ning logige välja seadmetest, mida te enam ei kasuta.</li>
        <li>Ärge lisage Apexile antud lehtedele ja teksti privaatset teavet: eeldage, et kõike sealset võidakse külastajale tsiteerida.</li>
        <li>Määrake oma saidile sobiv säilitusaeg ja päevane eelarve ning kasutage üleandmisaadressi, mida kontrollite teie.</li>
        <li>Teavitage külastajaid sellest, kuidas nende andmeid töötlete, nagu nõuavad isikuandmete kaitse üldmäärus ja KVKK.</li>
      </ul>

      <h2 id="report">Teatage haavatavusest või intsidendist</h2>
      <p>
        Kui arvate, et olete leidnud nõrkuse, või teie kontoga tundub midagi valesti olevat, kirjutage aadressil{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Lisage piisavalt üksikasju, et probleemi saaks korrata.
        Palun andke meile mõistlik võimalus see parandada enne avalikustamist ning ärge pääsege ligi teiste inimeste andmetele,
        ärge häirige teenust ega käivitage tootmiskeskkonna vastu automaatseid skaneeringuid. Kinnitame teie teate kättesaamist
        ja hoiame teid kursis.
      </p>
      <p>
        Ükski süsteem pole täiesti turvaline. Kui andmeleke puudutab teie andmeid, teavitame teid ja ametiasutusi seadusega
        nõutud viisil. Kuidas me isikuandmeid töötleme, vaadake <a href="/et/privacy">privaatsuspoliitikast</a>.
      </p>
    </>
  );
}

export const security: ProseContent = {
  eyebrow: "Usaldus",
  title: "Turvalisus",
  intro: "Kuidas Apex kaitseb teie kontot, teie külastajate vestlusi ja teie veebisaiti. Mis on vaikimisi sisse lülitatud – lihtsas keeles.",
  toc: [
    { id: "overview", label: "Lühidalt" },
    { id: "widget", label: "Veebisait ja vidin" },
    { id: "ai", label: "TI turvalisus" },
    { id: "abuse", label: "Kaitse kuritarvitamise ja kulude eest" },
    { id: "accounts", label: "Kontod ja sisselogimine" },
    { id: "data", label: "Teie andmete kaitse" },
    { id: "crawler", label: "Teie veebisaidi lugemine" },
    { id: "headers", label: "Brauseri kaitsed" },
    { id: "development", label: "Kuidas me seda arendame ja käitame" },
    { id: "shared", label: "Mida saate teha teie" },
    { id: "report", label: "Teata haavatavusest" },
  ],
  body: Body,
};
