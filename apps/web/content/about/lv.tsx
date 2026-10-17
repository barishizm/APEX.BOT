import { CONTACT_EMAIL } from "@/components/site-nav";
import type { MarketingContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="what">Kas ir Apex Bot</h2>
      <p>
        Apex Bot ir mākslīgā intelekta klientu atbalsta asistents vietnēm. Tas izlasa jūsu lapas, izveido no tām privātu
        zināšanu bāzi un jebkurā diennakts laikā atbild uz apmeklētāju jautājumiem tērzēšanas logrīkā latviešu, lietuviešu,
        igauņu, angļu un turku valodā. Tas atbild, izmantojot tikai to, ko esat tam devuši, norāda lapu, no kuras ņemta
        atbilde, un pasaka, ja kaut ko nezina.
      </p>
      <p>
        Pašlaik notiek beta testēšana. Kamēr tā ilgst, visas funkcijas ir bez maksas, un ikviens var{" "}
        <a href="/lv/signup">reģistrēties</a>.
      </p>

      <h2 id="why">Kāpēc mēs to izveidojām</h2>
      <p>
        Uz lielāko daļu jautājumu, ko uzņēmums saņem tiešsaistē, jau ir atbilde kaut kur tā paša vietnē: piegādes termiņi,
        atgriešanas noteikumi, darba laiks, kas ietilpst plānā. Apmeklētāji tomēr jautā, bieži ārpus darba laika, un daudzi
        aiziet, ja neviens neatbild. Vispārēja lietojuma tērzēšanas roboti šo plaisu aizpilda slikti: tie min, izdomā
        noteikumus un pārliecinoši runā par lietām, ko uzņēmums nekad nav teicis.
      </p>
      <blockquote>
        <p>
          “Mēs izveidojām Apex, lai katrs klients jebkurā diennakts laikā acumirklī saņemtu precīzu atbildi un atbalsta
          komandas beidzot varētu pievērsties sarežģītiem gadījumiem.”
        </p>
        <p>– Mahmut Barış Akıntı, dibinātājs un izpilddirektors</p>
      </blockquote>

      <h2 id="founder">Kas stāv aiz tā</h2>
      <p>
        Apex Bot dibināja <strong>Mahmut Barış Akıntı</strong>, kurš vada uzņēmumu kā izpilddirektors un veido produktu.
      </p>

      <h2 id="principles">Principi, kurus ievērojam</h2>
      <ul>
        <li>
          <strong>Jūsu saturs, nevis internets.</strong> Asistents atbild, izmantojot jūsu lapas un pievienoto tekstu, un
          neko citu. Sīkāk to skaidro lapa <a href="/lv/grounded-answers">“Kā darbojas pamatotas atbildes”</a>.
        </li>
        <li>
          <strong>Veidots tā, it kā tam uzbruks.</strong> Publisks tērzēšanas robots ir mērķis, tāpēc katrai vietnei pēc
          noklusējuma ir ieslēgta piesaiste domēnam, aizsardzība pret uzvedņu injekcijām, pieprasījumu ierobežojumi un dienas
          budžeti. Mūsu <a href="/lv/security">drošības lapā</a> ir uzskaitīts, ko produkts dara jau šodien.
        </li>
        <li>
          <strong>Privātums pēc noklusējuma.</strong> Personas dati žurnālos tiek maskēti, sarunas tiek dzēstas pēc jūsu
          izvēlētā perioda, un jūsu dati netiek izmantoti modeļu apmācībai, ja vien jūs tam nepiekrītat.{" "}
          <a href="/lv/privacy">Privātuma politika</a> ir sagatavota atbilstoši ES Vispārīgajai datu aizsardzības regulai
          (VDAR) un Turcijas KVKK.
        </li>
        <li>
          <strong>Vietējās valodas, ne tikai angļu.</strong> Latviešu, lietuviešu, igauņu, angļu un turku valoda tiek
          pilnībā atbalstīta gan atbildēs, gan katrā logrīka vārdā.
        </li>
        <li>
          <strong>Tas atbild, bet nerīkojas.</strong> Apex nevar veikt pasūtījumus, mainīt kontus vai dot solījumus. Kad
          apmeklētājam vajadzīgs cilvēks, tas nodod sarunu jūsu komandai pa e-pastu.
        </li>
      </ul>

      <h2 id="infrastructure">Kur tas darbojas</h2>
      <p>
        Tērzēšanas API darbojas Render platformā Frankfurtē, Vācijā. Vietni un vadības paneli nodrošina Vercel, bet konti un
        iestatījumi tiek glabāti pārvaldītā PostgreSQL datubāzē Supabase platformā. Pilns pakalpojumu sniedzēju saraksts un
        tas, ko katrs no tiem redz, ir pieejams <a href="/lv/privacy">privātuma politikā</a>. Katra pakalpojuma statusu
        reāllaikā varat pārbaudīt <a href="/lv/status">statusa lapā</a>.
      </p>

      <h2 id="contact">Kontakti</h2>
      <p>
        Jautājumu, sadarbības vai preses gadījumā rakstiet uz <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Mēs
        izlasām katru ziņu.
      </p>
    </>
  );
}

export const about: MarketingContent = {
  meta: {
    title: "Par mums",
    description:
      "Kāpēc mēs izveidojām Apex Bot – MI klientu atbalsta asistentu, kas atbild, izmantojot tikai jūsu vietni, – un principi, kurus ievērojam: pamatotība, drošība un privātums.",
    crumb: "Par mums",
  },
  eyebrow: "Par mums",
  title: "MI asistents, kas saka tikai to, ko saka jūsu vietne",
  intro: "Apex Bot palīdz uzņēmumiem atbildēt katram apmeklētājam jebkurā diennakts laikā, neko neizdomājot.",
  body: Body,
};
