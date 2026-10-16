import { CONTACT_EMAIL } from "@/components/site-nav";
import type { MarketingContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="what">Mis on Apex Bot</h2>
      <p>
        Apex Bot on tehisintellektil põhinev klienditoe assistent veebisaitidele. See loeb teie lehed läbi, loob neist
        privaatse teadmusbaasi ja vastab külastajate küsimustele vestlusvidinas eesti, läti, leedu, inglise ja türgi keeles
        igal kellaajal. See vastab ainult selle põhjal, mille olete talle andnud, viitab lehele, kust vastus pärineb, ja
        ütleb ausalt, kui midagi ei tea.
      </p>
      <p>
        Praegu on käimas suletud beetatestimine. Selle ajal on kõik funktsioonid tasuta ning uusi registreerimisi avatakse
        järk-järgult <a href="/et/signup">ootenimekirja</a> kaudu.
      </p>

      <h2 id="why">Miks me selle lõime</h2>
      <p>
        Enamikule küsimustele, mida ettevõte veebis saab, on vastus juba kuskil tema enda veebisaidil olemas: tarneajad,
        tagastustingimused, lahtiolekuajad, mida pakett sisaldab. Külastajad küsivad sellegipoolest, sageli väljaspool
        tööaega, ja paljud lahkuvad, kui keegi ei vasta. Üldotstarbelised vestlusrobotid täidavad seda lünka halvasti: nad
        arvavad, mõtlevad tingimusi välja ja räägivad enesekindlalt asjadest, mida ettevõte pole kunagi öelnud.
      </p>
      <blockquote>
        <p>
          „Lõime Apexi selleks, et iga klient saaks igal kellaajal kohe täpse vastuse ja klienditoe meeskonnad saaksid lõpuks
          keskenduda keerulistele juhtumitele.“
        </p>
        <p>– Mahmut Barış Akıntı, asutaja ja tegevjuht</p>
      </blockquote>

      <h2 id="founder">Kes selle taga on</h2>
      <p>
        Apex Boti asutas <strong>Mahmut Barış Akıntı</strong>, kes juhib ettevõtet tegevjuhina ja arendab toodet.
      </p>

      <h2 id="principles">Põhimõtted, millest kinni peame</h2>
      <ul>
        <li>
          <strong>Teie sisu, mitte internet.</strong> Assistent vastab teie lehtede ja lisatud teksti põhjal ning mitte millegi
          muu põhjal. Üksikasjalikumalt selgitab seda leht <a href="/et/grounded-answers">„Kuidas põhjendatud vastused töötavad“</a>.
        </li>
        <li>
          <strong>Ehitatud nii, nagu seda rünnataks.</strong> Avalik vestlusrobot on sihtmärk, seega on igal saidil vaikimisi
          sisse lülitatud domeenilukk, kaitse viibasüstide eest, päringupiirangud ja päevased eelarved. Meie{" "}
          <a href="/et/security">turvalisuse lehel</a> on loetletud, mida toode juba täna teeb.
        </li>
        <li>
          <strong>Vaikimisi privaatne.</strong> Isikuandmed maskeeritakse logides, vestlused kustutatakse pärast teie valitud
          perioodi ja teie andmeid ei kasutata mudelite treenimiseks, kui te selleks nõusolekut ei anna.{" "}
          <a href="/et/privacy">Privaatsuspoliitika</a> on koostatud vastavalt ELi isikuandmete kaitse üldmäärusele (GDPR) ja
          Türgi KVKK-le.
        </li>
        <li>
          <strong>Kohalikud keeled, mitte ainult inglise.</strong> Eesti, läti, leedu, inglise ja türgi keel on täielikult
          toetatud nii vastustes kui ka vidina igas sõnas.
        </li>
        <li>
          <strong>See vastab, kuid ei tegutse.</strong> Apex ei saa esitada tellimusi, muuta kontosid ega anda lubadusi. Kui
          külastaja vajab inimest, annab see vestluse e-posti teel üle teie meeskonnale.
        </li>
      </ul>

      <h2 id="infrastructure">Kus see töötab</h2>
      <p>
        Vestluse API töötab Renderi platvormil Saksamaal Frankfurdis. Veebisaiti ja töölauda teenindab Vercel ning kontod ja
        seaded salvestatakse hallatud PostgreSQL-i andmebaasi Supabase'i platvormil. Kõigi teenusepakkujate täielik loetelu ja
        see, mida igaüks neist näeb, on toodud <a href="/et/privacy">privaatsuspoliitikas</a>. Iga teenuse olekut reaalajas
        saate kontrollida <a href="/et/status">olekulehel</a>.
      </p>

      <h2 id="contact">Kontakt</h2>
      <p>
        Küsimuste, koostöö või meediapäringute korral kirjutage aadressil{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Loeme iga sõnumi läbi.
      </p>
    </>
  );
}

export const about: MarketingContent = {
  meta: {
    title: "Meist",
    description:
      "Miks me lõime Apex Boti – TI klienditoe assistendi, mis vastab ainult teie enda veebisaidi põhjal – ja põhimõtted, millest lähtume: põhjendatus, turvalisus ja privaatsus.",
    crumb: "Meist",
  },
  eyebrow: "Meist",
  title: "TI assistent, mis ütleb ainult seda, mida ütleb teie veebisait",
  intro: "Apex Bot aitab ettevõtetel vastata igale külastajale igal kellaajal, ilma midagi välja mõtlemata.",
  body: Body,
};
