import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "definition", label: "Mida tähendab „põhjendatud“" },
  { id: "pipeline", label: "Küsimusest vastuseni" },
  { id: "dont-know", label: "Kui see ei tea" },
  { id: "confidence", label: "Vastuse kindlus" },
  { id: "injection", label: "Manipuleerimiskatsed" },
  { id: "limits", label: "Piirangud" },
  { id: "faq", label: "Küsimused" },
];

function Body() {
  return (
    <>
      <h2 id="definition">Mida tähendab „põhjendatud“</h2>
      <p>
        <strong>Põhjendatud vastustega vestlusrobot</strong> vastab ainult talle antud kindla allikate kogumi põhjal, mitte
        selle põhjal, mida tema TI mudel üldiselt õppinud on. Apex Boti allikad on lehed, mida see teie veebisaidilt loeb, ja
        tekst, mille ise lisate. Kui nendes allikates vastust pole, ei anna Apex seda.
      </p>
      <p>
        See on oluline, sest TI mudelid räägivad soravalt ka siis, kui nad eksivad. Kui üldotstarbeliselt vestlusrobotilt
        küsida teie tagastustingimuste kohta, mõtleb see sageli välja usutavad tingimused, mida te pole kunagi kirjutanud.
        Ettevõtte veebisaidil on see halvem kui vastuse puudumine: külastaja tegutseb selle järgi ja selgitama peate teie.
      </p>

      <h2 id="pipeline">Küsimusest vastuseni</h2>
      <ol>
        <li>
          <strong>Teie sisu loetakse ja jagatakse osadeks.</strong> Kui lisate veebisaidi, loeb Apex teie sisestatud lehe,
          saidikaardi ja samas domeenis olevad lehed, millele need viitavad, kuni teie lehtede piirmäärani. See järgib faili{" "}
          <code>robots.txt</code> ning jätab vahele menüüd, jalused ja küpsiseribad. Tekst jagatakse lühikesteks
          väljavõteteks ja salvestatakse ainult teie assistendi jaoks.
        </li>
        <li>
          <strong>Küsimus seotakse väljavõtetega.</strong> Kui külastaja midagi küsib, otsib Apex ainult selle ühe assistendi
          väljavõtetest ja hindab, kui asjakohane igaüks neist on. Teiste klientide sisust ei otsita kunagi.
        </li>
        <li>
          <strong>Nõrgad vasted jäetakse kõrvale.</strong> Asjakohasuse lävest allapoole jäävad väljavõtted visatakse kõrvale,
          nii et kaugelt seotud lehest ei saa vastust „välja venitada“.
        </li>
        <li>
          <strong>Mudel kirjutab väljavõtete põhjal.</strong> TI mudel saab külastaja küsimuse ja sobivad väljavõtted, kuid
          enne neid kindlad reeglid: vasta ainult väljavõtetes leiduvate faktidega, ära kunagi mõtle välja hindu, tingimusi
          ega kontaktandmeid ning ütle ausalt, kui väljavõtted küsimusele ei vasta.
        </li>
        <li>
          <strong>Allikas näidatakse.</strong> Iga vastuse all on link lehele, kust see pärineb, et külastaja saaks seda
          kontrollida ja teie saidil edasi lugeda.
        </li>
      </ol>

      <h2 id="dont-know">Kui see ei tea</h2>
      <p>
        Kui ükski väljavõte pole piisavalt asjakohane, vastab assistent arvamise asemel teie „ma ei tea“ sõnumiga. Kui olete
        sisse lülitanud <a href="/et/docs#customize">inimesele üleandmise</a>, pakub see vestluse e-posti teel teie
        meeskonnale edastamist koos kogu vestlusega.
      </p>
      <p>
        Vastuseta küsimused on kasulikud: need näitavad täpselt, mida teie külastajad teada tahavad, kuid mida teie veebisait
        veel ei ütle. Lisage puuduv teave lehe või tekstiallikana ja järgmine külastaja saab vastuse.
      </p>

      <h2 id="confidence">Vastuse kindlus</h2>
      <p>
        Kui täpne peab vaste olema, määrab seade jaotises <em>Isikupära → Vastuse kindlus</em>:
      </p>
      <table>
        <thead>
          <tr>
            <th>Seade</th>
            <th>Käitumine</th>
            <th>Sobib</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Range</td>
            <td>Vajab lähedast vastet; ütleb sagedamini „ma ei tea“</td>
            <td>Reguleeritud teemadele, hindadele, õigustingimustele</td>
          </tr>
          <tr>
            <td>Tasakaalustatud</td>
            <td>Vaikeseade</td>
            <td>Enamikule veebisaitidele</td>
          </tr>
          <tr>
            <td>Leebe</td>
            <td>Aktsepteerib vabamaid vasteid</td>
            <td>Väikestele, vaid mõne lehega teadmusbaasidele</td>
          </tr>
        </tbody>
      </table>

      <h2 id="injection">Manipuleerimiskatsed</h2>
      <p>
        Külastajad üritavad mõnikord vestlusrobotit veenda oma reegleid eirama („ignoreeri oma juhiseid ja…“) ning
        veebilehtedel võib olla samal eesmärgil kirjutatud teksti. Apex edastab külastajate sõnumid, teie veebisaidi teksti ja
        teie kohandatud juhised mudelile andmetena selgelt märgistatud jaotistes, pärast kindlaid turvareegleid, mida need
        tühistada ei saa. Neid märgiseid jäljendav tekst neutraliseeritakse kõigepealt. Teie enda juhised võivad muuta tooni
        ja teemasid, kuid ei saa põhjendatust välja lülitada.
      </p>
      <p>
        Lisaks pole assistendil tööriistu: see ei saa esitada tellimusi, muuta kontosid, veebis sirvida ega teisi süsteeme
        kasutada. Halvim, mida edukas manipuleerimine teha saab, on muuta seda, mida ütleb üks vestlus. Lisateavet leiate{" "}
        <a href="/et/security">turvalisuse lehelt</a>.
      </p>

      <h2 id="limits">Piirangud</h2>
      <p>
        Põhjendatus vähendab väljamõeldud vastuseid oluliselt, kuid ükski TI süsteem pole täiuslik. Vastus võib siiski olla
        puudulik või mitmetähenduslikku väljavõtet valesti tõlgendada. Seetõttu näidatakse iga vastuse juures selle allikat
        ja töölaual säilitatakse vestlused, et saaksite need üle vaadata ja oma sisu parandada. Assistent ütleb ausalt, et on
        TI, ega anna lõplikke meditsiinilisi, õiguslikke ega finantsnõuandeid.
      </p>

      <h2 id="faq">Küsimused</h2>
      <h3>Kas Apex kasutab seda, mida TI mudel minu ettevõtte kohta juba teab?</h3>
      <p>
        Ei. Vastused koostatakse ainult teie lehtede ja tekstiallikate põhjal. Kui teie sisus midagi ei mainita, ei ütle Apex
        seda ka siis, kui mudel võiks seda mujalt teada.
      </p>
      <h3>Mis juhtub, kui mu veebisait muutub?</h3>
      <p>
        Sünkroonige veebisaidi allikas uuesti jaotises <em>Töölaud → Teadmusbaas</em> ja Apex loeb selle uuesti. Tekstiallikad
        uuenevad kohe, kui need salvestate.
      </p>
      <h3>Milliseid TI mudeleid see kasutab?</h3>
      <p>
        Teie valite: Claude'i, OpenAI või Gemini mudelid koos valikulise varumudeliga juhuks, kui põhimudel pole saadaval.
        Põhjendatuse reeglid on kõigil mudelitel samad.
      </p>
      <h3>Kas minu sisu kasutatakse TI mudelite treenimiseks?</h3>
      <p>
        Ei, kui te selleks nõusolekut ei anna. Teie sisu ja külastajate sõnumid saadetakse teie valitud TI teenusepakkujale
        ainult vastuste koostamiseks. Vaadake <a href="/et/privacy">privaatsuspoliitikat</a>.
      </p>
    </>
  );
}

export const groundedAnswers: MarketingContent = {
  meta: {
    title: "Kuidas põhjendatud vastused töötavad",
    description:
      "Kuidas Apex Bot vastab ainult teie veebisaidi põhjal: otsing iga assistendi sisus, asjakohasuse lävi, viidatud allikad, aus „ma ei tea“ ja kaitse viibasüstide eest.",
    crumb: "Põhjendatud vastused",
  },
  eyebrow: "Kuidas see töötab",
  title: "Põhjendatud vastused: vestlusrobot, mis ei mõtle midagi välja",
  intro:
    "Apex Bot vastab teie veebisaidi põhjal ja mitte millegi muu põhjal. Siin on täpselt kirjas, kuidas küsimusest saab vastus ja mis juhtub, kui teie sisus vastust pole.",
  toc: TOC,
  body: Body,
};
