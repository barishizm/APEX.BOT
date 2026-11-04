import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "definition", label: "Ko nozīmē “pamatota”" },
  { id: "pipeline", label: "No jautājuma līdz atbildei" },
  { id: "dont-know", label: "Kad tas nezina" },
  { id: "confidence", label: "Atbildes pārliecība" },
  { id: "injection", label: "Manipulācijas mēģinājumi" },
  { id: "limits", label: "Ierobežojumi" },
  { id: "faq", label: "Jautājumi" },
];

function Body() {
  return (
    <>
      <h2 id="definition">Ko nozīmē “pamatota”</h2>
      <p>
        <strong>Pamatots tērzēšanas robots</strong> atbild, izmantojot tikai noteiktu tam sniegtu avotu kopumu, nevis to, ko
        tā MI modelis kopumā ir iemācījies. Apex Bot avoti ir lapas, ko tas izlasa jūsu vietnē, un teksts, ko pievienojat
        paši. Ja šajos avotos atbildes nav, Apex to nesniedz.
      </p>
      <p>
        Tas ir svarīgi, jo MI modeļi runā raiti arī tad, kad kļūdās. Ja vispārējam tērzēšanas robotam pajautā par jūsu
        atgriešanas noteikumiem, tas bieži izdomā ticamus noteikumus, kurus jūs nekad neesat rakstījuši. Uzņēmuma vietnē tas
        ir sliktāk nekā nekāda atbilde: apmeklētājs rīkojas saskaņā ar to, un skaidroties nākas jums.
      </p>

      <h2 id="pipeline">No jautājuma līdz atbildei</h2>
      <ol>
        <li>
          <strong>Jūsu saturs tiek izlasīts un sadalīts.</strong> Kad pievienojat vietni, Apex izlasa jūsu ievadīto lapu,
          vietnes karti un lapas tajā pašā domēnā, uz kurām tās norāda, līdz jūsu lapu limitam. Tas ievēro{" "}
          <code>robots.txt</code> un izlaiž izvēlnes, kājenes un sīkdatņu joslas. Teksts tiek sadalīts īsos fragmentos un
          glabāts tikai jūsu asistentam.
        </li>
        <li>
          <strong>Jautājums tiek salīdzināts ar fragmentiem.</strong> Kad apmeklētājs kaut ko jautā, Apex meklē tikai šī viena
          asistenta fragmentos un novērtē, cik būtisks ir katrs no tiem. Citu klientu saturā meklēšana nekad nenotiek.
        </li>
        <li>
          <strong>Vājas atbilstības tiek atmestas.</strong> Fragmenti zem noteiktā atbilstības sliekšņa tiek atmesti, tāpēc no
          attāli saistītas lapas atbildi “izvilkt” nav iespējams.
        </li>
        <li>
          <strong>Modelis raksta, balstoties uz fragmentiem.</strong> MI modelis saņem apmeklētāja jautājumu un atbilstošos
          fragmentus, bet vispirms – noteiktus noteikumus: atbildēt tikai ar fragmentos atrodamiem faktiem, nekad neizdomāt
          cenas, noteikumus vai kontaktinformāciju un pateikt, ja fragmenti uz jautājumu neatbild.
        </li>
        <li>
          <strong>Tiek parādīts avots.</strong> Zem katras atbildes ir saite uz lapu, no kuras tā ņemta, lai apmeklētājs to
          varētu pārbaudīt un turpināt lasīt jūsu vietnē.
        </li>
      </ol>

      <h2 id="dont-know">Kad tas nezina</h2>
      <p>
        Ja neviens fragments nav pietiekami atbilstošs, asistents minēšanas vietā atbild ar jūsu “nezinu” ziņu. Ja esat
        ieslēguši <a href="/lv/docs#customize">nodošanu cilvēkam</a>, tas piedāvā nodot sarunu jūsu komandai pa e-pastu
        kopā ar visu sarunu.
      </p>
      <p>
        Neatbildētie jautājumi ir noderīgi: tie precīzi parāda, ko jūsu apmeklētāji vēlas uzzināt, bet jūsu vietnē vēl nav
        teikts. Pievienojiet trūkstošo informāciju kā lapu vai teksta avotu, un nākamais apmeklētājs saņems atbildi.
      </p>

      <h2 id="confidence">Atbildes pārliecība</h2>
      <p>
        Cik precīzai jābūt atbilstībai, nosaka iestatījums sadaļā <em>Personība → Atbildes pārliecība</em>:
      </p>
      <table>
        <thead>
          <tr>
            <th>Iestatījums</th>
            <th>Uzvedība</th>
            <th>Piemērots</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Stingra</td>
            <td>Vajadzīga cieša atbilstība; biežāk saka “nezinu”</td>
            <td>Regulētām tēmām, cenām, juridiskiem noteikumiem</td>
          </tr>
          <tr>
            <td>Līdzsvarota</td>
            <td>Noklusējuma iestatījums</td>
            <td>Lielākajai daļai vietņu</td>
          </tr>
          <tr>
            <td>Elastīga</td>
            <td>Pieņem brīvākas atbilstības</td>
            <td>Nelielām zināšanu bāzēm ar tikai dažām lapām</td>
          </tr>
        </tbody>
      </table>

      <h2 id="injection">Manipulācijas mēģinājumi</h2>
      <p>
        Apmeklētāji dažkārt mēģina pierunāt tērzēšanas robotu neievērot savus noteikumus (“ignorē savus norādījumus un…”), un
        tīmekļa lapās var būt teksts, kas rakstīts tieši šim nolūkam. Apex nodod apmeklētāju ziņas, jūsu vietnes tekstu un
        jūsu pielāgotos norādījumus modelim kā datus skaidri iezīmētās sadaļās pēc noteiktiem drošības noteikumiem, kurus tie
        nevar atcelt. Teksts, kas atdarina šos marķierus, vispirms tiek neitralizēts. Jūsu pašu norādījumi var mainīt toni un
        tēmas, bet nevar izslēgt pamatotību.
      </p>
      <p>
        Turklāt asistentam nav rīku: tas nevar veikt pasūtījumus, mainīt kontus, pārlūkot tīmekli vai sazināties ar citām
        sistēmām. Sliktākais, ko var izdarīt veiksmīga manipulācija, ir mainīt to, ko saka viena saruna. Vairāk par to –{" "}
        <a href="/lv/security">drošības lapā</a>.
      </p>

      <h2 id="limits">Ierobežojumi</h2>
      <p>
        Pamatotība ievērojami samazina izdomātu atbilžu skaitu, taču neviena MI sistēma nav nevainojama. Atbilde joprojām var
        būt nepilnīga vai nepareizi interpretēt divdomīgu fragmentu. Tāpēc katrai atbildei tiek parādīts tās avots, un
        vadības panelī tiek glabātas sarunas, lai jūs varētu tās pārskatīt un uzlabot savu saturu. Asistents godīgi atzīst,
        ka ir MI, un nesniedz galīgus medicīniskus, juridiskus vai finanšu padomus.
      </p>

      <h2 id="faq">Jautājumi</h2>
      <h3>Vai Apex izmanto to, ko MI modelis jau zina par manu uzņēmumu?</h3>
      <p>
        Nē. Atbildes tiek veidotas tikai no jūsu lapām un teksta avotiem. Ja jūsu saturā kaut kas nav minēts, Apex to nesaka,
        pat ja modelis to varētu zināt no citurienes.
      </p>
      <h3>Kas notiek, kad mana vietne mainās?</h3>
      <p>
        Sinhronizējiet vietnes avotu vēlreiz sadaļā <em>Vadības panelis → Zināšanu bāze</em>, un Apex to izlasīs no jauna.
        Teksta avoti tiek atjaunināti, tiklīdz tos saglabājat.
      </p>
      <h3>Kādus MI modeļus tas izmanto?</h3>
      <p>
        Izvēlaties jūs: Claude, OpenAI vai Gemini modeļus ar neobligātu rezerves modeli, ja galvenais nav pieejams.
        Pamatotības noteikumi visos modeļos ir vienādi.
      </p>
      <h3>Vai mans saturs tiek izmantots MI modeļu apmācībai?</h3>
      <p>
        Jūsu saturu savu modeļu uzlabošanai izmantojam tikai tad, ja esat tam piekrituši. Pagaidām izņēmums ir Google: mūsu
        meklēšana darbojas Gemini bezmaksas līmenī, kura noteikumi ļauj Google izmantot jūsu lapu tekstu un apmeklētāju ziņas
        savu produktu uzlabošanai. Tas pats attiecas uz atbildēm, ja izvēlaties Gemini modeli. Skatiet{" "}
        <a href="/lv/privacy">privātuma politiku</a>.
      </p>
    </>
  );
}

export const groundedAnswers: MarketingContent = {
  meta: {
    title: "Kā darbojas pamatotas atbildes",
    description:
      "Kā Apex Bot atbild, izmantojot tikai jūsu vietni: meklēšana katra asistenta saturā, atbilstības slieksnis, norādīti avoti, godīgs “nezinu” un aizsardzība pret injekcijām.",
    crumb: "Pamatotas atbildes",
  },
  eyebrow: "Kā tas darbojas",
  title: "Pamatotas atbildes: tērzēšanas robots, kas neko neizdomā",
  intro:
    "Apex Bot atbild, izmantojot jūsu vietni un neko citu. Lūk, kā tieši jautājums kļūst par atbildi un kas notiek, ja jūsu saturā atbildes nav.",
  toc: TOC,
  body: Body,
};
