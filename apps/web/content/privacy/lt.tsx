import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="who">Kam ši politika taikoma</h2>
      <ul>
        <li>
          <strong>Klientams</strong>: asmenims, kurie susikuria Apex paskyrą ir paruošia asistentą, taip pat asmenims mūsų
          laukiančiųjų sąraše. Jūsų paskyros duomenų valdytojas esame mes.
        </li>
        <li>
          <strong>Lankytojams</strong>: asmenims, kurie kalbasi su asistentu kliento svetainėje. Duomenų valdytojas yra
          klientas; lankytojų duomenis tvarkome jo vardu ir tik pagal jo nurodymus.
        </li>
      </ul>
      <p>
        Ši politika aprašo, kaip Apex Bot veikia šiandien. Kaip saugome duomenis, išsamiau paaiškinta{" "}
        <a href="/lt/security">saugumo</a> puslapyje.
      </p>

      <h2 id="collect">Ką renkame</h2>
      <h3>Iš klientų</h3>
      <table>
        <thead>
          <tr>
            <th>Duomenys</th>
            <th>Kodėl</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vardas, naudotojo vardas, el. pašto adresas, paskyros tipas, įmonės pavadinimas ir dydis (verslo paskyroms)</td>
            <td>Jūsų paskyrai ir darbo sričiai sukurti ir tvarkyti</td>
          </tr>
          <tr>
            <td>Slaptažodis, saugomas tik kaip su druska sukurta scrypt maiša. Paskyros, kurios naudoja Google ar GitHub, neturi slaptažodžio, nebent jį nustatote</td>
            <td>Jums prijungti</td>
          </tr>
          <tr>
            <td>
              Jei prisijungiate per Google ar GitHub: paslaugų teikėjo paskyros ID ir jūsų patvirtintas el. pašto adresas bei
              vardas. Niekada nematome jūsų Google ar GitHub slaptažodžio ir niekada nieko neskelbiame jūsų paskyroje
            </td>
            <td>Jums prijungti ir susieti paslaugų teikėją su jūsų paskyra</td>
          </tr>
          <tr>
            <td>Kada sutikote su sąlygomis, kurią jų versiją, ir jūsų pasirinkimas dėl modelių apmokymo</td>
            <td>Jūsų sutikimui užfiksuoti</td>
          </tr>
          <tr>
            <td>Saugumo žurnalas: prisijungimai, nesėkmingi prisijungimai, patvirtinimo ir slaptažodžio atkūrimo užklausos,
              slaptažodžio keitimai, atsijungimas kituose įrenginiuose ir paskyros ištrynimas – kiekvienas su laiku, IP adresu ir
              naršykle</td>
            <td>Paskyroms apsaugoti, spėliojimui ir piktnaudžiavimui riboti bei incidentams tirti</td>
          </tr>
          <tr>
            <td>Aktyvios sesijos: IP adresas, naršyklė ir kada kiekviena buvo paskutinį kartą naudota</td>
            <td>Kad liktumėte prisijungę ir galėtumėte atsijungti kituose įrenginiuose</td>
          </tr>
          <tr>
            <td>Jūsų asistento nustatymai, svetainės, kuriose leidžiate jam veikti, puslapiai, kuriuos Apex perskaito jūsų
              svetainėje, ir jūsų pridėtas tekstas</td>
            <td>Jūsų lankytojams atsakyti</td>
          </tr>
          <tr>
            <td>Jūsų nustatytas perdavimo el. pašto adresas ir patvirtinimo kodas, kurį jam siunčiame</td>
            <td>Patvirtinti, kad adresas jūsų, prieš jam ką nors siunčiant</td>
          </tr>
          <tr>
            <td>Kiekvieno asistento per dieną sunaudotų DI žetonų skaičius</td>
            <td>Jūsų nustatytam dienos biudžetui užtikrinti ir išlaidoms išlaikyti nuspėjamas</td>
          </tr>
          <tr>
            <td>El. pašto adresas (ir puslapio kalba), jei prisijungiate prie laukiančiųjų sąrašo</td>
            <td>Vieną kartą jums pranešti, kai atidarysime registraciją. Kitiems tikslams jo nenaudojame</td>
          </tr>
        </tbody>
      </table>

      <h3>Iš kliento svetainės lankytojų</h3>
      <table>
        <thead>
          <tr>
            <th>Duomenys</th>
            <th>Kodėl</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lankytojo rašomos žinutės ir asistento atsakymai su po kiekvienu atsakymu rodomais šaltinių puslapiais</td>
            <td>Pokalbiui palaikyti ir jį parodyti klientui</td>
          </tr>
          <tr>
            <td>Teigiamas ar neigiamas atsakymo įvertinimas</td>
            <td>Parodyti klientui, kuriuos atsakymus reikia tobulinti</td>
          </tr>
          <tr>
            <td>Svetainės adresas, kuriame vyko pokalbis</td>
            <td>Leidžiamų svetainių sąrašui užtikrinti ir pokalbiams grupuoti</td>
          </tr>
          <tr>
            <td>Vardas, el. pašto adresas ir telefono numeris, tik jei lankytojas pats nusprendžia juos įvesti (perdavimo
              prašyme arba kliento kontaktų formoje)</td>
            <td>Prašymui ar kontaktui perduoti klientui el. paštu ir parodyti jo valdymo skydelyje</td>
          </tr>
          <tr>
            <td>Lankytojo IP adresas, trumpai laikomas atmintyje</td>
            <td>Žinučių kiekiui vienam lankytojui riboti. Kartu su pokalbiu jis nesaugomas</td>
          </tr>
        </tbody>
      </table>
      <p>
        Asmens duomenų neparduodame, nenaudojame reklamai ir nekuriame reklaminių profilių. Lankytojų neprašoma susikurti
        paskyros, o valdiklis jiems praneša, kad jie kalbasi su DI. Per pokalbį lankytojų neturėtų būti prašoma jautrios
        informacijos (sveikatos, mokėjimo kortelių, asmens kodų); jei lankytojas vis tiek ją įveda, ji tvarkoma kaip bet kuri
        kita žinutė, o kortelių, telefono, el. pašto ir IBAN šablonai mūsų žurnaluose užmaskuojami.
      </p>

      <h2 id="use">Kaip naudojame duomenis</h2>
      <ul>
        <li>Paslaugai teikti: jus prijungti, atsakyti lankytojams, pristatyti perdavimus ir kontaktus, rodyti pokalbius.</li>
        <li>Paslaugos saugumui užtikrinti: užklausų ribos, robotų patikra, piktnaudžiavimo aptikimas ir incidentų tyrimas.</li>
        <li>Siųsti jums el. laiškus: patvirtinimo ir slaptažodžio atkūrimo kodus, perdavimo ir kontaktų pranešimus bei saugumo pranešimus.</li>
        <li>Savo modeliams tobulinti – tik jei tam pritarėte (žr. toliau).</li>
        <li>Teisinėms prievolėms vykdyti.</li>
      </ul>
      <p>
        Teisiniai pagrindai (BDAR) ir sąlygos (KVKK): su jumis sudarytos sutarties vykdymas; mūsų teisėtas interesas
        užtikrinti saugumą ir užkirsti kelią piktnaudžiavimui; jūsų sutikimas, kai jo prašome (modelių apmokymas, laukiančiųjų
        sąrašas); ir teisinės prievolės. Lankytojų duomenų tvarkymo tikslą ir teisinį pagrindą nustato klientas.
      </p>

      <h2 id="providers">Kas dar tvarko duomenis</h2>
      <p>
        Naudojamės nedideliu skaičiumi paslaugų teikėjų (duomenų subtvarkytojų), kiekvienu – tik nurodytai užduočiai. Neteikiame
        jiems daugiau, nei reikia tai užduočiai atlikti.
      </p>
      <table>
        <thead>
          <tr>
            <th>Paslaugų teikėjas</th>
            <th>Kam</th>
            <th>Susiję duomenys</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic, OpenAI arba Google (tas, kurį klientas pasirinko tam asistentui)</td>
            <td>Atsakymams generuoti</td>
            <td>Lankytojo žinutė, naujausios pokalbio žinutės ir aktualios kliento turinio dalys</td>
          </tr>
          <tr>
            <td>Supabase (valdoma PostgreSQL)</td>
            <td>Duomenų bazė</td>
            <td>Viskas, ką saugome: paskyros, nustatymai, žinios, pokalbiai</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Svetainės ir valdymo skydelio talpinimas</td>
            <td>Užklausos į svetainę, įskaitant IP adresus</td>
          </tr>
          <tr>
            <td>Render (Frankfurtas, Vokietija)</td>
            <td>Pokalbių API, su kuria bendrauja valdiklis, talpinimas</td>
            <td>Pokalbių užklausos ir vykstantis pokalbis</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>El. laiškų siuntimas</td>
            <td>Gavėjo adresas ir laiško turinys (kodai, perdavimai, kontaktai)</td>
          </tr>
          <tr>
            <td>Cloudflare Turnstile</td>
            <td>Žmonių atskyrimas nuo robotų registruojantis, prisijungiant, atkuriant slaptažodį ir laukiančiųjų sąraše</td>
            <td>Patikros žetonas, jūsų IP adresas ir naršyklės signalai, reikalingi patikrai atlikti</td>
          </tr>
          <tr>
            <td>Google ir GitHub</td>
            <td>Mygtukai „Prisijungti per“, tik jei juos naudojate</td>
            <td>Tai, ką grąžina paslaugų teikėjas (žr. aukščiau)</td>
          </tr>
        </tbody>
      </table>
      <p>
        DI paslaugų teikėjai duomenis tvarko pagal savo API sąlygas, kad grąžintų atsakymą. Kai kurie paslaugų teikėjai yra
        įsikūrę už Turkijos ir ES / EEE ribų, todėl duomenys gali būti perduodami į užsienį; kai reikia, remiamės įstatymų
        numatytomis apsaugos priemonėmis, pavyzdžiui, standartinėmis sutarčių sąlygomis, ir paties paslaugų teikėjo
        įsipareigojimais. Taip pat galime atskleisti duomenis, kai to teisėtai reikalauja teismas ar institucija.
      </p>

      <h2 id="training">Modelių apmokymas</h2>
      <p>
        Kliento asistentus ir pokalbius savo modeliams tobulinti naudojame tik tuo atveju, jei klientas tam pritarė
        registruodamasis. Pagal numatytuosius nustatymus – ne. Šį pasirinkimą bet kada galite pakeisti valdymo skydelio
        skiltyje „Paskyros nustatymai“ arba susisiekę su mumis; tai taikoma nuo pakeitimo tvarkomiems duomenims.
      </p>

      <h2 id="retention">Kiek laiko saugome duomenis</h2>
      <table>
        <thead>
          <tr>
            <th>Duomenys</th>
            <th>Kiek laiko</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pokalbiai ir juose esantys kontaktiniai duomenys</td>
            <td>
              Ištrinami automatiškai, kai jie nenaudojami kliento nustatytą saugojimo laikotarpį – nuo 1 iki 365 dienų (pagal
              numatytuosius nustatymus 30). Klientas bet kurį pokalbį gali ištrinti anksčiau valdymo skydelyje, o lankytojas gali
              paprašyti klientą ištrinti jo pokalbį
            </td>
          </tr>
          <tr>
            <td>Sesijos</td>
            <td>24 valandos naršyklės sesijai, 30 dienų pasirinkus „Likti prisijungus“. Atsijungus, pakeitus ar atkūrus slaptažodį jos baigiasi anksčiau</td>
          </tr>
          <tr>
            <td>Patvirtinimo ir atkūrimo kodai</td>
            <td>Galioja 15 minučių; saugomi tik kaip maiša</td>
          </tr>
          <tr>
            <td>Paskyros duomenys, nustatymai ir žinios</td>
            <td>Kol egzistuoja paskyra. Ištrynus paskyrą, jie taip pat ištrinami, nebent įstatymai reikalauja ką nors išsaugoti</td>
          </tr>
          <tr>
            <td>Saugumo žurnalas</td>
            <td>
              Saugomas, kad galėtume tirti piktnaudžiavimą ir incidentus. Ištrynus paskyrą, įrašai atsiejami nuo jos, o jūs
              galite paprašyti ištrinti įrašus, kuriuose yra jūsų el. pašto adresas ar IP adresas (galime išsaugoti tai, ko
              reikalauja įstatymai)
            </td>
          </tr>
          <tr>
            <td>Laukiančiųjų sąrašo el. pašto adresas</td>
            <td>Kol atidarysime registraciją ir jums pranešime arba kol paprašysite jį pašalinti</td>
          </tr>
          <tr>
            <td>Dienos žetonų skaičiai</td>
            <td>Kartu su asistentu, kuriam jie priklauso</td>
          </tr>
          <tr>
            <td>Programų žurnalai</td>
            <td>Ribotą laiką; el. pašto adresai, telefono numeriai, kortelių numeriai ir IBAN užmaskuojami prieš įrašant</td>
          </tr>
        </tbody>
      </table>
      <p>
        Mūsų paslaugų teikėjų saugomi duomenys po ištrynimo dar trumpą laiką gali likti jų atsarginėse kopijose ir pašalinami,
        kai tos kopijos pakeičiamos naujomis.
      </p>

      <h2 id="cookies">Slapukai ir naršyklės saugykla</h2>
      <table>
        <thead>
          <tr>
            <th>Pavadinimas</th>
            <th>Ką jis daro</th>
            <th>Galiojimas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>apex_session</td>
            <td>Išlaiko jus prisijungusius. Būtinasis; HttpOnly, todėl puslapio scenarijai jo negali perskaityti</td>
            <td>Naršyklės sesija arba 30 dienų, jei pasirinkote „Likti prisijungus“</td>
          </tr>
          <tr>
            <td>apex_signed_in</td>
            <td>Nekenksmingas žymuo, leidžiantis mūsų viešiems puslapiams rodyti „Valdymo skydelis“ vietoj „Prisijungti“. Asmens duomenų neturi</td>
            <td>Tiek pat, kiek sesija</td>
          </tr>
          <tr>
            <td>Kalbos slapukas</td>
            <td>Prisimena jūsų pasirinktą kalbą</td>
            <td>1 metai</td>
          </tr>
          <tr>
            <td>apex_oauth</td>
            <td>Apsaugo vykstantį prisijungimą per Google ar GitHub. Vienkartinis</td>
            <td>10 minučių</td>
          </tr>
        </tbody>
      </table>
      <p>
        Nenaudojame reklaminių ar analitinių slapukų. Pokalbių valdiklis slapukų nenaudoja; priklausomai nuo kliento nustatymų,
        lankytojo naršyklėje jis laiko tik dabartinio pokalbio ID (skirtukui, naršyklei arba visai nelaiko). Kai veikia
        Cloudflare Turnstile, savo užduočiai atlikti jis gali naudoti savo saugyklą.
      </p>

      <h2 id="rights">Jūsų teisės</h2>
      <p>
        Galite paprašyti sužinoti, ar tvarkome jūsų duomenis, susipažinti su jais, juos ištaisyti, gauti jų kopiją perkeliamu
        formatu, juos ištrinti, apriboti jų naudojimą arba nesutikti su juo, taip pat atšaukti sutikimą (BDAR ir KVKK 11
        straipsnis).
      </p>
      <ul>
        <li>
          <strong>Ištrinkite paskyrą patys</strong> valdymo skydelio skiltyje „Paskyros nustatymai“. Bus pašalinta jūsų paskyra
          ir kiekviena darbo sritis, kurioje buvote vienintelis narys, kartu su jos asistentais, žiniomis ir pokalbiais.
        </li>
        <li>
          <strong>Valdykite savo sesijas</strong>: nustatymuose pakeiskite slaptažodį ir atsijunkite visuose kituose
          įrenginiuose.
        </li>
        <li>
          <strong>Lankytojai</strong>, norėdami peržiūrėti ar ištrinti savo pokalbį, turėtų kreiptis į svetainę, kurioje
          kalbėjosi; mes padedame tam klientui atsakyti.
        </li>
        <li>
          Dėl visų kitų klausimų, įskaitant savo duomenų kopiją, rašykite adresu{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Atsakome per 30 dienų. Prieš imdamiesi veiksmų, galime
          paprašyti patvirtinti jūsų tapatybę.
        </li>
      </ul>
      <p>
        Taip pat galite pateikti skundą duomenų apsaugos priežiūros institucijai (Lietuvoje – Valstybinei duomenų apsaugos
        inspekcijai, kitose ES šalyse – savo šalies institucijai, Turkijoje – Asmens duomenų apsaugos institucijai, KVKK).
      </p>

      <h2 id="customers">Jei esate klientas: jūsų pareigos</h2>
      <p>
        Jūs esate savo lankytojų duomenų valdytojas. Tai reiškia, kad sprendžiate, ką asistentas renka, jums reikia tam
        teisinio pagrindo ir turite pateikti lankytojams pranešimus, kurių reikalauja BDAR, KVKK ar panašūs įstatymai
        (valdiklis gali rodyti įspėjimo eilutę su nuorodomis į jūsų pačių politiką). Pasirinkite saugojimo laikotarpį,
        atitinkantį tai, ką jiems nurodote. Jei mūsų bus paklausta apie lankytojo duomenis, nukreipsime jį pas jus ir padėsime
        jums atsakyti. Tai aptarta ir mūsų <a href="/lt/terms">paslaugų teikimo sąlygose</a>.
      </p>

      <h2 id="security">Saugumas</h2>
      <p>
        Duomenys šifruojami perdavimo metu, prieiga ribojama kiekvienai darbo sričiai, slaptažodžiai saugomi kaip scrypt maišos,
        o asistentas atsako tik jūsų leistose svetainėse. Išsamiau tai paaiškinta <a href="/lt/security">saugumo puslapyje</a>.
        Nė viena sistema nėra visiškai saugi; jei duomenų saugumo pažeidimas paveiks jus, pranešime jums ir institucijoms, kaip
        reikalauja įstatymai.
      </p>

      <h2 id="children">Vaikai</h2>
      <p>
        Apex skirtas verslui ir suaugusiesiems. Sąmoningai nerenkame jaunesnių nei 16 metų vaikų duomenų paskyrai tvarkyti.
        Jei manote, kad vaikas mums pateikė duomenų, susisiekite su mumis ir juos ištrinsime.
      </p>

      <h2 id="changes">Pakeitimai ir kontaktai</h2>
      <p>
        Šį puslapį atnaujinsime keičiantis produktui, o apie esminius pakeitimus paskyrų turėtojams pranešime prieš jiems
        įsigaliojant. Paskutinio pakeitimo data nurodyta viršuje. Klausimai ar prašymai:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Teisinė informacija",
  title: "Privatumo politika",
  intro: `Versija ${TERMS_VERSION}. Ką renkame, kodėl, kas dar tai mato, kiek laiko saugome ir kokius pasirinkimus turite. Parengta atsižvelgiant į BDAR (ES) ir KVKK (Turkija) reikalavimus.`,
  toc: [
    { id: "who", label: "Kam ši politika taikoma" },
    { id: "collect", label: "Ką renkame" },
    { id: "use", label: "Kaip naudojame duomenis" },
    { id: "providers", label: "Kas dar tvarko duomenis" },
    { id: "training", label: "Modelių apmokymas" },
    { id: "retention", label: "Kiek laiko saugome duomenis" },
    { id: "cookies", label: "Slapukai ir saugykla" },
    { id: "rights", label: "Jūsų teisės" },
    { id: "customers", label: "Jei esate klientas" },
    { id: "security", label: "Saugumas" },
    { id: "children", label: "Vaikai" },
    { id: "changes", label: "Pakeitimai ir kontaktai" },
  ],
  body: Body,
};
