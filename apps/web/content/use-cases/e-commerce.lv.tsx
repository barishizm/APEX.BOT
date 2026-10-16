import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Ko jautā pircēji" },
  { id: "how", label: "Kā Apex uz tiem atbild" },
  { id: "orders", label: "Jautājumi par konkrētiem pasūtījumiem" },
  { id: "setup", label: "Iestatīšana veikalam" },
  { id: "costs", label: "Prognozējamas izmaksas" },
  { id: "faq", label: "Jautājumi" },
];

function Body() {
  return (
    <>
      <h2 id="questions">Ko jautā pircēji</h2>
      <p>
        Lielākā daļa ziņu, ko saņem interneta veikals, ir dažu vienu un to pašu jautājumu variācijas, un atbildes uz tiem jau
        ir paša veikala lapās:
      </p>
      <ul>
        <li>Cik ilgi notiek piegāde un cik tā maksā uz manu pilsētu vai valsti?</li>
        <li>Vai varu to atgriezt, cik dienu man ir un kas maksā par atgriešanu?</li>
        <li>Kādu izmēru izvēlēties? No kā tas ir izgatavots? Vai tas der šim modelim?</li>
        <li>Kādus maksājumu veidus pieņemat? Vai varu maksāt pa daļām?</li>
        <li>Vai jums ir fizisks veikals, un kad tas ir atvērts?</li>
      </ul>
      <p>
        Pircēji to jautā naktīs un brīvdienās – tieši pirms lēmuma pirkt. Neatbildēts jautājums šajā brīdī bieži nozīmē
        pamestu iepirkumu grozu.
      </p>

      <h2 id="how">Kā Apex uz tiem atbild</h2>
      <p>
        Apex Bot izlasa jūsu produktu, piegādes, atgriešanas un BUJ lapas un jebkurā diennakts laikā tērzēšanas logrīkā
        atbild, balstoties uz tām. Katrai atbildei ir saite uz lapu, no kuras tā ņemta, lai pircējs varētu pārbaudīt detaļas un
        palikt jūsu vietnē.
      </p>
      <ul>
        <li>
          <strong>Nekādu izdomātu noteikumu.</strong> Apex apgalvo tikai to, kas rakstīts jūsu lapās. Ja atgriešanas lapā kāds
          gadījums nav minēts, asistents pasaka, ka nezina, nevis izdomā noteikumu, kas jums būtu jāievēro.{" "}
          <a href="/lv/grounded-answers">Kā darbojas pamatotas atbildes</a>.
        </li>
        <li>
          <strong>Piecas valodas.</strong> Latviešu, lietuviešu, igauņu, angļu un turku: pircēji saņem atbildi tajā valodā,
          kurā raksta, un tas palīdz veikaliem, kas tirgojas vairākās valstīs.
        </li>
        <li>
          <strong>Kontaktu iegūšana.</strong> Pirms sarunas sākuma varat palūgt vārdu, e-pastu vai tālruņa numuru, lai
          jautājums pārvērstos turpmākā saziņā.
        </li>
        <li>
          <strong>Izskatās pēc jūsu veikala.</strong> Zīmola krāsa, palaišanas pogas ikona, sveiciens un ieteiktie jautājumi,
          piemēram, “Piegādes termiņi” vai “Atgriešanas noteikumi”, – tie visi ir iestatījumi ar tiešo priekšskatījumu.
        </li>
      </ul>

      <h2 id="orders">Jautājumi par konkrētiem pasūtījumiem</h2>
      <p>
        Apex atbild uz jautājumiem, bet nerīkojas. Tas nevar atrast pasūtījumu, mainīt adresi vai atmaksāt naudu un neizliksies,
        ka var. Uz jautājumu “Kur ir mans pasūtījums Nr. 1234?” tas var paskaidrot, kā darbojas pasūtījumu izsekošana, balstoties
        uz jūsu palīdzības lapām, un piedāvāt <strong>nodošanu cilvēkam</strong>: pircēja jautājums un visa saruna tiek
        nosūtīti jūsu komandai pa e-pastu, un, kad atbildat, jūs sarunājaties ar pircēju tieši.
      </p>
      <p className="callout">
        Tā kā asistentam nav piekļuves jūsu veikala administrācijai vai klientu datiem, apmeklētājs, kurš mēģina ar to
        manipulēt, nevar ar tā palīdzību neko redzēt vai mainīt. Sliktākajā gadījumā – viena dīvaina saruna.
      </p>

      <h2 id="setup">Iestatīšana veikalam</h2>
      <ol>
        <li>
          Pievienojiet sava veikala adresi kā zināšanu avotu. Apex izlasa vietnes karti un saistītās lapas līdz jūsu lapu
          limitam. Pārliecinieties, ka ir iekļautas piegādes, atgriešanas, maksājumu un izmēru tabulas lapas.
        </li>
        <li>
          Pievienojiet teksta avotu par visu, kā vēl nav jūsu vietnē, piemēram, kurjeru pieņemšanas laikus vai to, kā rīkojaties
          ar bojātām pakām.
        </li>
        <li>Iestatiet sveicienu un divus vai trīs jautājumus, ko klienti uzdod visbiežāk.</li>
        <li>
          Ielīmējiet iegulšanas kodu savā motīvā. Ir detalizēti ceļveži <a href="/lv/integrations/shopify">Shopify</a> un{" "}
          <a href="/lv/integrations/wordpress">WordPress / WooCommerce</a>, bet <a href="/lv/docs#platforms">dokumentācijā</a>{" "}
          ir aprakstītas Wix, Squarespace un citas platformas.
        </li>
        <li>
          Sadaļā <em>Atļautās vietnes</em> pievienojiet gan <code>https://jusuveikals.lv</code>, gan{" "}
          <code>https://www.jusuveikals.lv</code>. Logrīks darbojas tikai jūsu norādītajās adresēs.
        </li>
      </ol>

      <h2 id="costs">Prognozējamas izmaksas</h2>
      <p>
        Noslogotam veikalam nevajadzētu saņemt negaidītu rēķinu. Katram asistentam ir pieprasījumu ierobežojums vienam
        apmeklētājam, maksimālais ziņas garums un dienas tokenu budžets. Kad budžets ir iztērēts, tērzēšana līdz nākamajai
        dienai pēc UTC piedāvā nodošanu cilvēkam, nevis palielina izmaksas. Beta versijas laikā Apex ir bez maksas; vēlākie
        plāni ir atrodami <a href="/lv/pricing">cenu lapā</a>.
      </p>

      <h2 id="faq">Jautājumi</h2>
      <h3>Vai tas ieteiks produktus?</h3>
      <p>
        Tas var aprakstīt un salīdzināt produktus, balstoties uz jūsu produktu lapām, un sniegt saites uz tām. Tas neredz
        aktuālos krājumus vai cenas, kas nav izlasītajās lapās, tāpēc pēc lielām kataloga izmaiņām sinhronizējiet vietni
        vēlreiz.
      </p>
      <h3>Vai tas darbojas norēķinu lapā?</h3>
      <p>
        Tas darbojas visur, kur jūsu motīvs ielādē iegulšanas kodu. Dažas platformas, tostarp Shopify, norēķinu lapās motīva
        kodu neielādē, tāpēc tērzēšana ir redzama veikala lapās, bet ne norēķinoties.
      </p>
      <h3>Vai pircēju dati ir drošībā?</h3>
      <p>
        E-pasta adreses, tālruņu un karšu numuri tiek maskēti, pirms žurnālos kaut kas tiek ierakstīts, sarunas tiek dzēstas
        pēc jūsu izvēlētā glabāšanas perioda, un logrīks neizmanto sīkdatnes. Skatiet <a href="/lv/security">drošību</a> un{" "}
        <a href="/lv/privacy">privātumu</a>.
      </p>
    </>
  );
}

export const ecommerce: MarketingContent = {
  meta: {
    title: "MI tērzēšanas robots e-komercijas veikaliem",
    description:
      "Atbildiet uz jautājumiem par piegādi, atgriešanu, izmēriem un maksājumiem 24/7 ar MI tērzēšanas robotu, kas izmanto tikai jūsu veikala lapas. Piecās valodās.",
    crumb: "E-komercija",
  },
  eyebrow: "E-komercijai",
  title: "MI tērzēšanas robots interneta veikaliem, kas nekad neizdomā atgriešanas noteikumus",
  intro:
    "Atbildiet uz jautājumiem par piegādi, atgriešanu, izmēriem un maksājumiem visu diennakti, izmantojot sava veikala lapas, latviešu, lietuviešu, igauņu, angļu un turku valodā.",
  toc: TOC,
  body: Body,
};
