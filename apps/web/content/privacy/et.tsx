import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="who">Keda see puudutab</h2>
      <ul>
        <li>
          <strong>Kliendid</strong>: inimesed, kes loovad Apexi konto ja seadistavad assistendi, ning inimesed meie
          ootenimekirjas. Teie kontoandmete vastutav töötleja oleme meie.
        </li>
        <li>
          <strong>Külastajad</strong>: inimesed, kes vestlevad assistendiga kliendi veebisaidil. Vastutav töötleja on klient;
          meie töötleme külastajate andmeid tema nimel ja ainult tema juhiste järgi.
        </li>
      </ul>
      <p>
        See poliitika kirjeldab, kuidas Apex Bot täna töötab. Kuidas me andmeid kaitseme, on üksikasjalikumalt selgitatud{" "}
        <a href="/et/security">turvalisuse</a> lehel.
      </p>

      <h2 id="collect">Mida me kogume</h2>
      <h3>Klientidelt</h3>
      <table>
        <thead>
          <tr>
            <th>Andmed</th>
            <th>Miks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Nimi, kasutajanimi, e-posti aadress, konto tüüp, ettevõtte nimi ja suurus (ärikontode puhul)</td>
            <td>Teie konto ja tööruumi loomiseks ja haldamiseks</td>
          </tr>
          <tr>
            <td>Parool, mida hoitakse ainult soolaga scrypt-räsina. Google'i või GitHubi kasutavatel kontodel pole parooli, kui te seda ise ei määra</td>
            <td>Teie sisselogimiseks</td>
          </tr>
          <tr>
            <td>
              Kui logite sisse Google'i või GitHubiga: teenusepakkuja konto ID ning teie kinnitatud e-posti aadress ja nimi. Me ei
              näe kunagi teie Google'i või GitHubi parooli ega postita kunagi midagi teie kontole
            </td>
            <td>Teie sisselogimiseks ja teenusepakkuja sidumiseks teie kontoga</td>
          </tr>
          <tr>
            <td>Millal tingimustega nõustusite, millise versiooniga ja teie valik mudelite treenimise kohta</td>
            <td>Teie nõusoleku kohta arvestuse pidamiseks</td>
          </tr>
          <tr>
            <td>Turvalogi: sisselogimised, ebaõnnestunud sisselogimised, kinnitus- ja parooli lähtestamise taotlused,
              paroolimuudatused, teistest seadmetest väljalogimine ja konto kustutamine – igaüks koos aja, IP-aadressi ja
              brauseriga</td>
            <td>Kontode kaitsmiseks, arvamise ja kuritarvitamise piiramiseks ning intsidentide uurimiseks</td>
          </tr>
          <tr>
            <td>Aktiivsed seansid: IP-aadress, brauser ja millal igaüht viimati kasutati</td>
            <td>Et te jääksite sisselogituks ja saaksite teistest seadmetest välja logida</td>
          </tr>
          <tr>
            <td>Teie assistendi seaded, veebisaidid, kus lubate sellel töötada, lehed, mida Apex teie veebisaidilt loeb, ja teie
              lisatud tekst</td>
            <td>Teie külastajatele vastamiseks</td>
          </tr>
          <tr>
            <td>Teie määratud üleandmise e-posti aadress ja kinnituskood, mille sellele saadame</td>
            <td>Et enne sinna kirjade saatmist kinnitada, et aadress kuulub teile</td>
          </tr>
          <tr>
            <td>Iga assistendi päevas kasutatud TI tokenite arv</td>
            <td>Teie määratud päevase eelarve jõustamiseks ja kulude prognoositavana hoidmiseks</td>
          </tr>
          <tr>
            <td>E-posti aadress (ja lehe keel), kui liitute ootenimekirjaga</td>
            <td>Et teile üks kord teada anda, kui registreerimine avatakse. Muuks me seda ei kasuta</td>
          </tr>
        </tbody>
      </table>

      <h3>Kliendi veebisaidi külastajatelt</h3>
      <table>
        <thead>
          <tr>
            <th>Andmed</th>
            <th>Miks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Külastaja kirjutatud sõnumid ja assistendi vastused koos iga vastuse all näidatud allikalehtedega</td>
            <td>Vestluse pidamiseks ja kliendile näitamiseks</td>
          </tr>
          <tr>
            <td>Vastuse positiivne või negatiivne hinnang</td>
            <td>Et näidata kliendile, milliseid vastuseid tuleb parandada</td>
          </tr>
          <tr>
            <td>Veebisaidi aadress, kus vestlus toimus</td>
            <td>Lubatud veebisaitide loendi jõustamiseks ja vestluste rühmitamiseks</td>
          </tr>
          <tr>
            <td>Nimi, e-posti aadress ja telefon, ainult kui külastaja otsustab need ise sisestada (üleandmise taotluses või
              kliendi kontaktivormis)</td>
            <td>Taotluse või kontakti edastamiseks kliendile e-postiga ja tema töölaual kuvamiseks</td>
          </tr>
          <tr>
            <td>Külastaja IP-aadress, mida hoitakse lühiajaliselt mälus</td>
            <td>Sõnumite piiramiseks külastaja kohta. Seda ei salvestata koos vestlusega</td>
          </tr>
        </tbody>
      </table>
      <p>
        Me ei müü isikuandmeid, ei kasuta neid reklaamiks ega loo reklaamiprofiile. Külastajatel ei paluta kontot luua ja vidin
        teavitab neid, et nad suhtlevad TI-ga. Vestluses ei tohiks külastajatelt küsida delikaatset teavet (terviseandmed,
        maksekaardid, isikukoodid); kui külastaja selle siiski sisestab, käsitletakse seda nagu iga teist sõnumit ning kaardi-,
        telefoni-, e-posti ja IBAN-i mustrid maskeeritakse meie logides.
      </p>

      <h2 id="use">Kuidas me andmeid kasutame</h2>
      <ul>
        <li>Teenuse osutamiseks: teie sisselogimiseks, külastajatele vastamiseks, üleandmiste ja kontaktide edastamiseks, vestluste kuvamiseks.</li>
        <li>Teenuse turvalisuse tagamiseks: päringupiirangud, robotikontrollid, kuritarvitamise tuvastamine ja intsidentide uurimine.</li>
        <li>Teile e-kirjade saatmiseks: kinnitus- ja parooli lähtestamise koodid, üleandmis- ja kontaktiteavitused ning turvateated.</li>
        <li>Oma mudelite täiustamiseks – ainult siis, kui olete selleks nõusoleku andnud (vt allpool).</li>
        <li>Seadusest tulenevate kohustuste täitmiseks.</li>
      </ul>
      <p>
        Õiguslikud alused (isikuandmete kaitse üldmäärus) ja tingimused (KVKK): teiega sõlmitud lepingu täitmine; meie
        õigustatud huvi tagada turvalisus ja vältida kuritarvitamist; teie nõusolek, kui seda küsime (mudelite treenimine,
        ootenimekiri); ning seadusest tulenevad kohustused. Külastajate andmete töötlemise eesmärgi ja õigusliku aluse määrab
        klient.
      </p>

      <h2 id="providers">Kes veel andmeid töötleb</h2>
      <p>
        Kasutame väikest arvu teenusepakkujaid (alamtöötlejaid), igaüht ainult loetletud ülesande jaoks. Me ei anna neile
        rohkem, kui see ülesanne vajab.
      </p>
      <table>
        <thead>
          <tr>
            <th>Teenusepakkuja</th>
            <th>Milleks</th>
            <th>Asjaomased andmed</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic, OpenAI või Google (see, mille klient selle assistendi jaoks valis)</td>
            <td>Vastuste koostamine</td>
            <td>Külastaja sõnum, vestluse viimased sõnumid ja kliendi sisu asjakohased osad</td>
          </tr>
          <tr>
            <td>Supabase (hallatud PostgreSQL)</td>
            <td>Andmebaas</td>
            <td>Kõik, mida säilitame: kontod, seaded, teadmised, vestlused</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Veebisaidi ja töölaua majutamine</td>
            <td>Päringud veebisaidile, sealhulgas IP-aadressid</td>
          </tr>
          <tr>
            <td>Render (Frankfurt, Saksamaa)</td>
            <td>Vestluse API majutamine, millega vidin suhtleb</td>
            <td>Vestluspäringud ja pooleliolev vestlus</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>E-kirjade saatmine</td>
            <td>Saaja aadress ja sõnumi sisu (koodid, üleandmised, kontaktid)</td>
          </tr>
          <tr>
            <td>Cloudflare Turnstile</td>
            <td>Inimeste eristamine robotitest registreerumisel, sisselogimisel, parooli lähtestamisel ja ootenimekirjas</td>
            <td>Kontrollitõend, teie IP-aadress ja brauseri signaalid, mida kontrolliks vaja on</td>
          </tr>
          <tr>
            <td>Google ja GitHub</td>
            <td>Nupud „Logi sisse teenusega“, ainult kui neid kasutate</td>
            <td>See, mille teenusepakkuja tagastab (vt eespool)</td>
          </tr>
        </tbody>
      </table>
      <p>
        TI teenusepakkujad töötlevad andmeid vastuse tagastamiseks oma API tingimuste alusel. Mõned teenusepakkujad asuvad
        väljaspool Türgit ja EL-i/EMP-d, seega võidakse andmeid edastada välismaale; vajaduse korral tugineme seaduses
        sätestatud kaitsemeetmetele, nagu lepingu tüüptingimused, ja teenusepakkuja enda kohustustele. Võime andmeid avaldada
        ka siis, kui kohus või ametiasutus seda seaduslikult nõuab.
      </p>

      <h2 id="training">Mudelite treenimine</h2>
      <p>
        Kasutame kliendi assistente ja vestlusi oma mudelite täiustamiseks ainult siis, kui klient andis selleks registreerumisel
        nõusoleku. Vaikimisi on vastus ei. Saate seda valikut igal ajal muuta töölaua jaotises „Konto seaded“ või meiega
        ühendust võttes; see mõjutab edaspidi töödeldavaid andmeid.
      </p>

      <h2 id="retention">Kui kaua me andmeid säilitame</h2>
      <table>
        <thead>
          <tr>
            <th>Andmed</th>
            <th>Kui kaua</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vestlused ja neis olevad kontaktandmed</td>
            <td>
              Kustutatakse automaatselt, kui need on olnud kasutamata kliendi määratud säilitusaja – 1 kuni 365 päeva
              (vaikimisi 30). Klient saab mis tahes vestluse töölaualt varem kustutada ja külastaja võib paluda kliendil oma
              vestlus kustutada
            </td>
          </tr>
          <tr>
            <td>Seansid</td>
            <td>Brauseri seansi puhul 24 tundi, valikuga „Jäta mind sisselogituks“ 30 päeva. Väljalogimine, parooli muutmine või lähtestamine lõpetab need varem</td>
          </tr>
          <tr>
            <td>Kinnitus- ja lähtestamiskoodid</td>
            <td>Kehtivad 15 minutit; säilitatakse ainult räsina</td>
          </tr>
          <tr>
            <td>Kontoandmed, seaded ja teadmised</td>
            <td>Seni, kuni konto on olemas. Konto kustutamisel kustutatakse ka need, välja arvatud juhul, kui seadus nõuab millegi säilitamist</td>
          </tr>
          <tr>
            <td>Turvalogi</td>
            <td>
              Säilitatakse, et saaksime kuritarvitusi ja intsidente uurida. Konto kustutamisel seotakse kirjed kontost lahti ning
              võite paluda kustutada kirjed, mis sisaldavad teie e-posti aadressi või IP-aadressi (võime säilitada seda, mida
              seadus nõuab)
            </td>
          </tr>
          <tr>
            <td>Ootenimekirja e-posti aadress</td>
            <td>Kuni registreerimise avamise ja teile teatamiseni või kuni palute selle eemaldada</td>
          </tr>
          <tr>
            <td>Päevased tokenite arvud</td>
            <td>Koos assistendiga, kellele need kuuluvad</td>
          </tr>
          <tr>
            <td>Rakenduse logid</td>
            <td>Piiratud aja; e-posti aadressid, telefoninumbrid, kaardinumbrid ja IBAN-id maskeeritakse enne kirjutamist</td>
          </tr>
        </tbody>
      </table>
      <p>
        Meie teenusepakkujate hoitavad andmed võivad pärast kustutamist jääda veel lühikeseks ajaks nende varukoopiatesse ja
        eemaldatakse, kui need varukoopiad välja vahetatakse.
      </p>

      <h2 id="cookies">Küpsised ja brauseri salvestusruum</h2>
      <table>
        <thead>
          <tr>
            <th>Nimi</th>
            <th>Mida see teeb</th>
            <th>Kehtivus</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>apex_session</td>
            <td>Hoiab teid sisselogituna. Rangelt vajalik; HttpOnly, seega ei saa lehe skriptid seda lugeda</td>
            <td>Brauseri seanss või 30 päeva, kui valisite „Jäta mind sisselogituks“</td>
          </tr>
          <tr>
            <td>apex_signed_in</td>
            <td>Kahjutu lipp, mis laseb meie avalikel lehtedel näidata „Töölaud“ asemel „Logi sisse“. Isikuandmeid ei sisalda</td>
            <td>Sama mis seansil</td>
          </tr>
          <tr>
            <td>Keeleküpsis</td>
            <td>Jätab meelde teie valitud keele</td>
            <td>1 aasta</td>
          </tr>
          <tr>
            <td>apex_oauth</td>
            <td>Kaitseb pooleliolevat Google'i või GitHubiga sisselogimist. Ühekordne</td>
            <td>10 minutit</td>
          </tr>
        </tbody>
      </table>
      <p>
        Me ei kasuta reklaami- ega analüütikaküpsiseid. Vestlusvidin ei salvesta küpsiseid; sõltuvalt kliendi seadetest hoiab see
        külastaja brauseris ainult praeguse vestluse ID-d (vahekaardi, brauseri jaoks või üldse mitte). Kui Cloudflare Turnstile
        töötab, võib see oma ülesande täitmiseks kasutada enda salvestusruumi.
      </p>

      <h2 id="rights">Teie õigused</h2>
      <p>
        Võite paluda teavet selle kohta, kas me teie andmeid töötleme, nendega tutvuda, neid parandada, saada need
        ülekantavas vormingus, need kustutada, piirata nende kasutamist või esitada selle vastu vastuväiteid ning võtta
        nõusoleku tagasi (isikuandmete kaitse üldmäärus ja KVKK artikkel 11).
      </p>
      <ul>
        <li>
          <strong>Kustutage oma konto ise</strong> töölaua jaotises „Konto seaded“. See eemaldab teie konto ja iga tööruumi, mille
          ainus liige olite, koos selle assistentide, teadmiste ja vestlustega.
        </li>
        <li>
          <strong>Hallake oma seansse</strong>: muutke seadetes parooli ja logige välja kõigist teistest seadmetest.
        </li>
        <li>
          <strong>Külastajad</strong> peaksid oma vestluse vaatamiseks või kustutamiseks pöörduma veebisaidi poole, kus nad
          vestlesid; meie aitame sellel kliendil vastata.
        </li>
        <li>
          Kõigis muudes küsimustes, sealhulgas oma andmete koopia saamiseks, kirjutage aadressil{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Vastame 30 päeva jooksul. Enne tegutsemist võime paluda teil
          oma isikut tõendada.
        </li>
      </ul>
      <p>
        Samuti võite esitada kaebuse andmekaitse järelevalveasutusele (Eestis Andmekaitse Inspektsioonile, teistes ELi
        riikides oma riigi asutusele, Türgis isikuandmete kaitse ametile KVKK).
      </p>

      <h2 id="customers">Kui olete klient: teie kohustused</h2>
      <p>
        Olete oma külastajate andmete vastutav töötleja. See tähendab, et teie otsustate, mida assistent kogub, teil peab
        selleks olema õiguslik alus ning peate andma külastajatele teavituse, mida nõuavad isikuandmete kaitse üldmäärus, KVKK
        või sarnased seadused (vidin võib kuvada hoiatusrea koos linkidega teie enda poliitikale). Valige säilitusaeg, mis vastab
        sellele, mida neile ütlete. Kui meilt küsitakse külastaja andmete kohta, suuname ta teie juurde ja aitame teil vastata.
        Seda käsitlevad ka meie <a href="/et/terms">kasutustingimused</a>.
      </p>

      <h2 id="security">Turvalisus</h2>
      <p>
        Andmed krüpteeritakse edastamisel, juurdepääs on piiratud tööruumipõhiselt, paroolid räsitakse scryptiga ja assistent
        vastab ainult teie lubatud veebisaitidel. Üksikasjalikumalt selgitab seda <a href="/et/security">turvalisuse leht</a>.
        Ükski süsteem pole täiesti turvaline; kui andmeleke teid puudutab, teavitame teid ja ametiasutusi seadusega nõutud
        viisil.
      </p>

      <h2 id="children">Lapsed</h2>
      <p>
        Apex on mõeldud ettevõtetele ja täiskasvanutele. Me ei kogu teadlikult konto haldamiseks andmeid alla 16-aastastelt
        lastelt. Kui arvate, et laps on meile andmeid andnud, võtke meiega ühendust ja me kustutame need.
      </p>

      <h2 id="changes">Muudatused ja kontakt</h2>
      <p>
        Uuendame seda lehte toote muutumisel ja teavitame kontoomanikke olulistest muudatustest enne nende jõustumist. Viimase
        muudatuse kuupäev on toodud üleval. Küsimused või taotlused: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Õigusteave",
  title: "Privaatsuspoliitika",
  intro: `Versioon ${TERMS_VERSION}. Mida me kogume, miks, kes seda veel näeb, kui kaua me seda säilitame ja millised valikud teil on. Koostatud vastavalt isikuandmete kaitse üldmääruse (EL) ja KVKK (Türgi) nõuetele.`,
  toc: [
    { id: "who", label: "Keda see puudutab" },
    { id: "collect", label: "Mida me kogume" },
    { id: "use", label: "Kuidas me andmeid kasutame" },
    { id: "providers", label: "Kes veel andmeid töötleb" },
    { id: "training", label: "Mudelite treenimine" },
    { id: "retention", label: "Kui kaua andmeid säilitame" },
    { id: "cookies", label: "Küpsised ja salvestusruum" },
    { id: "rights", label: "Teie õigused" },
    { id: "customers", label: "Kui olete klient" },
    { id: "security", label: "Turvalisus" },
    { id: "children", label: "Lapsed" },
    { id: "changes", label: "Muudatused ja kontakt" },
  ],
  body: Body,
};
