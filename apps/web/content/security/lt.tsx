import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="overview">Trumpai</h2>
      <p>
        Pokalbių robotas jūsų svetainėje yra viešas, todėl Apex kūrėme manydami, kad kas nors bandys juo piktnaudžiauti:
        padidinti jūsų sąskaitą, priversti jį pasakyti tai, ko neturėtų, perskaityti kito kliento duomenis ar perimti paskyrą.
        Čia aprašytos apsaugos, kurios įjungtos pagal numatytuosius nustatymus. Šiame puslapyje aprašoma, ką produktas daro
        šiandien, o ne siekiai.
      </p>

      <h2 id="widget">Jūsų svetainė ir pokalbių valdiklis</h2>
      <ul>
        <li>
          <strong>Veikia tik jūsų svetainėse.</strong> Kiekvienas asistentas turi viešą svetainės raktą, tačiau pokalbių API jį
          priima tik iš jūsų nurodytų svetainių. Užklausos iš bet kurios kitos kilmės atmetamos, kaip ir naršyklės
          išankstiniai patikrinimai (pre-flight), todėl nukopijuotas įterpimo kodas kitur nieko nedaro. Svetainės raktas nėra
          paslaptis ir nesuteikia prieigos prie jūsų paskyros.
        </li>
        <li>
          <strong>Atskirtas nuo jūsų puslapio.</strong> Valdiklis atvaizduojamas Shadow DOM aplinkoje, todėl jūsų svetainės
          CSS negali jo sugadinti, o jis neskaito jūsų puslapio.
        </li>
        <li>
          <strong>Jokių slapukų, jokio sekimo.</strong> Valdiklis nenaudoja slapukų ir trečiųjų šalių sekiklių. Priklausomai nuo
          jūsų nustatymo, jis prisimena tik pokalbio ID – skirtuke, naršyklėje arba visai neprisimena.
        </li>
        <li>
          <strong>Tik nedidelės užklausos.</strong> Kiekviena užklausa ribojama iki 16 KB, žinučių ilgis ribojamas (pagal
          numatytuosius nustatymus 1 000 simbolių, galima keisti), o pokalbis turi didžiausią ilgį.
        </li>
        <li>
          <strong>Atsakymai nėra talpinami podėlyje</strong> ir siunčiami su <code>nosniff</code>, todėl naršyklė ar CDN negali
          išsaugoti ar kitaip interpretuoti lankytojo pokalbio.
        </li>
      </ul>

      <h2 id="ai">DI sauga</h2>
      <ul>
        <li>
          <strong>Atsakymai remiasi jūsų turiniu.</strong> Asistentui nurodyta atsakyti tik faktais, esančiais puslapiuose ir
          tekste, kuriuos pateikėte Apex, niekada neišsigalvoti kainų, taisyklių ar kontaktinių duomenų ir pasakyti, kad
          nežino, kai nieko aktualaus nerasta. Kai nežino, jis gali pasiūlyti perduoti pokalbį jūsų komandai.
        </li>
        <li>
          <strong>Atsparus raginimų injekcijoms.</strong> Lankytojų žinutės, jūsų svetainės tekstas ir jūsų pačių pasirinktinės
          instrukcijos perduodami modeliui kaip duomenys aiškiai pažymėtose skiltyse, o fiksuotos saugumo taisyklės eina
          pirmiausia ir jos negali jų panaikinti. Tekstas, mėgdžiojantis mūsų skilčių žymenis, neutralizuojamas prieš jam
          pasiekiant modelį. Jūsų instrukcijos gali formuoti toną ir temas, bet negali išjungti pagrįstumo ar saugumo.
        </li>
        <li>
          <strong>Jokių įrankių, jokių veiksmų.</strong> Asistentas negali pateikti užsakymų, keisti paskyrų, vykdyti kodo,
          naršyti internete ar kreiptis į kitas sistemas. Blogiausia, ką gali padaryti sėkminga manipuliacija, – pakeisti tai,
          ką sako vienas pokalbis.
        </li>
        <li>
          <strong>Atvirai sako esantis DI</strong> ir neteikia galutinių medicininių, teisinių ar finansinių patarimų. Taip pat
          galite išvardyti temas, apie kurias jis turi mandagiai atsisakyti kalbėti.
        </li>
        <li>
          <strong>Atskirta kiekvienam klientui.</strong> Paieška vykdoma tik klausiamo asistento turinyje, todėl vieno kliento
          žinios niekada nenaudojamos atsakant kito kliento svetainėje.
        </li>
      </ul>

      <h2 id="abuse">Apsauga nuo piktnaudžiavimo ir išlaidų</h2>
      <ul>
        <li>
          <strong>Užklausų riba kiekvienam lankytojui</strong>: pagal numatytuosius nustatymus 15 žinučių per minutę vienam
          lankytojui, galima keisti kiekvienam asistentui (nuo 1 iki 120), be to, taikoma bendra asistento riba, todėl vienas
          asmuo ar scenarijus negali išnaudoti jūsų limito.
        </li>
        <li>
          <strong>Dienos žetonų biudžetas</strong> kiekvienam asistentui (pagal numatytuosius nustatymus 2 milijonai, iki
          20 milijonų), skaičiuojamas duomenų bazėje, todėl išlieka ir po paleidimo iš naujo. Jam pasibaigus, asistentas iki
          kitos dienos pagal UTC nebeatsako, užuot didinęs išlaidas.
        </li>
        <li>
          <strong>El. paštas negali tapti šlamšto patranka.</strong> Perdavimai ribojami kiekvienam lankytojui, asistentui ir
          gavėjui – per valandą ir per dieną. Perdavimo adresas turi būti patvirtintas jam išsiųstu kodu, kol jam ką nors
          išsiųsime, todėl niekas negali nukreipti sistemos į svetimo žmogaus pašto dėžutę.
        </li>
        <li>
          <strong>Robotų patikra.</strong> Registraciją, prisijungimą ir slaptažodžio atkūrimą saugo
          Cloudflare Turnstile. Jei patikros atlikti nepavyksta, užklausa atmetama, o ne leidžiama.
        </li>
      </ul>

      <h2 id="accounts">Paskyros ir prisijungimas</h2>
      <ul>
        <li>
          <strong>Slaptažodžiai</strong> niekada nesaugomi; saugoma tik su druska sukurta scrypt maiša (sąmoningai lėta,
          daug atminties reikalaujanti funkcija). Mažiausias ilgis – 8 simboliai. Maišas vėliau galima sustiprinti niekam
          neužblokuojant prieigos.
        </li>
        <li>
          <strong>El. pašto patvirtinimas</strong> privalomas prieš atveriant valdymo skydelį. Kodai yra šešių skaitmenų, galioja
          15 minučių, saugomi tik kaip maiša, užblokuojami po 5 neteisingų bandymų, o jų prašymų ir spėjimų skaičius per
          valandą ribojamas.
        </li>
        <li>
          <strong>Apsauga nuo slaptažodžių rinkimo.</strong> Nesėkmingi prisijungimai skaičiuojami pagal el. pašto adresą, IP
          adresą ir jų derinį, o tolesni bandymai užblokuojami 15 minučių. Nežinomo el. pašto adreso atmetimas trunka tiek pat,
          kiek neteisingo slaptažodžio, o klaidos pranešimas toks pat, todėl forma neatskleidžia, kuriems adresams sukurtos
          paskyros.
        </li>
        <li>
          <strong>Sesijos.</strong> Slapuke saugomas atsitiktinis 256 bitų žetonas; mūsų duomenų bazėje laikoma tik jo SHA-256
          maiša, todėl duomenų bazės nutekėjimas neatskleidžia aktyvių sesijų. Slapukas yra HttpOnly (scenarijai jo neperskaito),
          Secure (tik HTTPS) ir SameSite=Lax. Sesija trunka 24 valandas arba 30 dienų, jei pasirenkate „Likti prisijungus“.
        </li>
        <li>
          <strong>Kontrolė lieka jums.</strong> Pakeitus ar atkūrus slaptažodį, atjungiami visi kiti įrenginiai. Visus kitus
          įrenginius taip pat galite atjungti nustatymuose ir matyti, kiek jų aktyvių.
        </li>
        <li>
          <strong>Prisijungimas per Google ir GitHub</strong> naudoja vienkartinę būsenos reikšmę (o Google – ir PKCE). Priimame
          tik tokį el. pašto adresą, kurį paslaugų teikėjas nurodo kaip patvirtintą, todėl niekas negali pasisavinti ne savo
          adreso.
        </li>
        <li>
          <strong>Saugumo žurnalas.</strong> Prisijungimai, nesėkmingi bandymai, atkūrimai ir slaptažodžių keitimai
          registruojami nurodant laiką, IP adresą ir naršyklę, kad būtų galima ištirti incidentą.
        </li>
        <li>
          <strong>Paskyrą galite ištrinti</strong> patys, patvirtinę įvesdami savo el. pašto adresą. Kartu ištrinamos darbo
          sritys, kuriose esate vienintelis narys.
        </li>
      </ul>

      <h2 id="data">Jūsų duomenų apsauga</h2>
      <ul>
        <li>
          <strong>Šifravimas perdavimo metu.</strong> Kiekvienas ryšys su svetaine, valdymo skydeliu ir pokalbių API naudoja
          HTTPS su HSTS (dvejiems metams, įskaitant subdomenus), todėl naršyklės niekada negrįžta prie nešifruoto HTTP. Ryšys su
          duomenų baze šifruojamas, o pokalbių API tikrina duomenų bazės sertifikatą.
        </li>
        <li>
          <strong>Kiekviena darbo sritis atskirta.</strong> Valdymo skydelio užklausos visada apribotos prisijungusio naudotojo
          darbo sritimi. Kiekvienoje duomenų bazės lentelėje įjungta eilučių lygmens apsauga be viešų politikų, todėl viešoji
          duomenų bazės REST sąsaja nieko negali perskaityti; tai gali tik mūsų serveriai su savo prisijungimo duomenimis.
        </li>
        <li>
          <strong>Kodai ir žetonai saugomi kaip maišos</strong>, o ne perskaitoma forma: sesijų žetonai, patvirtinimo ir
          slaptažodžio atkūrimo kodai bei perdavimo patvirtinimo kodai.
        </li>
        <li>
          <strong>Asmens duomenys nepatenka į žurnalus.</strong> El. pašto adresai, telefono numeriai, kortelių numeriai
          (tikrinami Luhn algoritmu) ir Turkijos, Lietuvos, Latvijos bei Estijos IBAN numeriai užmaskuojami prieš į mūsų
          programų žurnalus įrašant bet ką.
        </li>
        <li>
          <strong>Saugojimo trukmę nustatote jūs.</strong> Pokalbiai automatiškai ištrinami praėjus jūsų pasirinktam
          laikotarpiui (nuo 1 iki 365 dienų, pagal numatytuosius nustatymus 30), o bet kurį iš jų galite ištrinti patys valdymo
          skydelyje.
        </li>
        <li>
          <strong>Apmokymas – tik su sutikimu.</strong> Jūsų turinį savo modeliams tobulinti naudojame tik tada, jei sutikote, o
          šį pasirinkimą galite bet kada pakeisti.
        </li>
        <li>
          <strong>Talpinama ES ten, kur tai svarbu.</strong> Pokalbių API veikia Frankfurte, Vokietijoje. Visi duomenis
          tvarkantys paslaugų teikėjai nurodyti <a href="/lt/privacy#providers">privatumo politikoje</a>.
        </li>
      </ul>

      <h2 id="crawler">Saugus jūsų svetainės skaitymas</h2>
      <p>
        Kai pateikiate Apex URL, mūsų skaitytuvas jį atsisiunčia jūsų vardu. Kadangi URL įvedate jūs, laikome jį nepatikimais
        įvesties duomenimis, kad jo nebūtų galima panaudoti mūsų vidiniam tinklui pasiekti:
      </p>
      <ul>
        <li>Tik <code>http</code> ir <code>https</code> standartiniais prievadais (80 ir 443); jokių URL su įterptais prisijungimo duomenimis.</li>
        <li>
          Tik vieši adresai. Privatūs, grįžtamojo ryšio (loopback), vietinio ryšio (link-local) ir rezervuoti diapazonai
          blokuojami, įskaitant jų IPv6 ir į IPv4 susietas formas, o patikrinamas adresas, prie kurio iš tikrųjų jungiamasi, –
          tai užkerta kelią DNS perrišimo (DNS rebinding) gudrybėms. Vietiniai prieglobos vardai, pavyzdžiui,{" "}
          <code>localhost</code>, <code>.local</code> ir <code>.internal</code>, atmetami.
        </li>
        <li>Kiekvienas peradresavimas tikrinamas iš naujo, daugiausia 5 šuoliai. Laikas ir dydis ribojami, įskaitant po išskleidimo, kad būtų sustabdytos „zip bombos“.</li>
        <li>
          Jis prisistato kaip <code>ApexBot</code> ir laikosi svetainės <code>robots.txt</code>.
        </li>
      </ul>

      <h2 id="headers">Naršyklės apsaugos</h2>
      <p>Valdymo skydelis ir svetainė kiekviename puslapyje siunčia šias saugumo antraštes:</p>
      <ul>
        <li><code>X-Frame-Options: DENY</code> ir <code>frame-ancestors 'none'</code>, kad valdymo skydelio nebūtų galima įterpti į rėmelį spustelėjimų užgrobimui.</li>
        <li><code>Strict-Transport-Security</code> dvejiems metams, įskaitant subdomenus.</li>
        <li><code>X-Content-Type-Options: nosniff</code> ir griežta nukreipiančiojo puslapio (referrer) politika.</li>
        <li><code>object-src 'none'</code> ir <code>base-uri 'self'</code> turinio saugumo politikoje.</li>
        <li>Leidimų politika, išjungianti kamerą, mikrofoną ir vietos nustatymą.</li>
      </ul>
      <p>
        API priima tik JSON turinį, kurio kitos svetainės forma negali išsiųsti be išankstinio patikrinimo, o serverį
        identifikuojanti antraštė neatskleidžiama.
      </p>

      <h2 id="development">Kaip jį kuriame ir eksploatuojame</h2>
      <ul>
        <li>Kodas, tvarkantis prisijungimą, paiešką, užklausų ribas, skaitytuvą ir duomenų maskavimą, turi automatinius testus.</li>
        <li>Paslaptys (API raktai, duomenų bazės prisijungimo duomenys) laikomos talpinimo paslaugų teikėjų paslapčių saugyklose, o ne kode.</li>
        <li>Duomenų bazės pakeitimai yra versijuojamos migracijos, kurios taikomos automatiškai ir saugiai paleidžiamos pakartotinai.</li>
        <li>Paslaugų teikėjai, kuriais remiamės, ir tai, ką kiekvienas gauna, išvardyti <a href="/lt/privacy#providers">privatumo politikoje</a>.</li>
      </ul>

      <h2 id="shared">Ką galite padaryti jūs</h2>
      <ul>
        <li>Nurodykite tik tas svetaines, kuriose turi būti rodomas asistentas, ir peržiūrėkite sąrašą, kai keičiasi jūsų domenai.</li>
        <li>Naudokite stiprų, unikalų slaptažodį arba prisijungimą per Google ar GitHub ir atjunkite nebenaudojamus įrenginius.</li>
        <li>Nepateikite privačios informacijos puslapiuose ir tekste, kuriuos teikiate Apex: laikykite, kad visa tai gali būti pacituota lankytojui.</li>
        <li>Nustatykite jūsų svetainei tinkamą saugojimo laikotarpį ir dienos biudžetą bei naudokite jūsų kontroliuojamą perdavimo adresą.</li>
        <li>Informuokite lankytojus, kaip tvarkote jų duomenis, kaip reikalauja BDAR ir KVKK.</li>
      </ul>

      <h2 id="report">Praneškite apie pažeidžiamumą ar incidentą</h2>
      <p>
        Jei manote, kad radote silpnąją vietą, arba kažkas negerai su jūsų paskyra, rašykite adresu{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Pateikite pakankamai informacijos, kad problemą būtų galima
        atkartoti. Prašome suteikti mums pagrįstą galimybę ją ištaisyti prieš skelbiant viešai ir nesinaudoti kitų asmenų
        duomenimis, netrikdyti paslaugos ir nevykdyti automatinių skenavimų produkcinėje aplinkoje. Patvirtinsime, kad gavome
        jūsų pranešimą, ir informuosime apie eigą.
      </p>
      <p>
        Nė viena sistema nėra visiškai saugi. Jei duomenų saugumo pažeidimas paveiks jūsų duomenis, pranešime jums ir
        institucijoms, kaip reikalauja įstatymai. Kaip tvarkome asmens duomenis, rasite <a href="/lt/privacy">privatumo
        politikoje</a>.
      </p>
    </>
  );
}

export const security: ProseContent = {
  eyebrow: "Patikimumas",
  title: "Saugumas",
  intro: "Kaip Apex saugo jūsų paskyrą, jūsų lankytojų pokalbius ir jūsų svetainę. Kas įjungta pagal numatytuosius nustatymus – paprasta kalba.",
  toc: [
    { id: "overview", label: "Trumpai" },
    { id: "widget", label: "Svetainė ir valdiklis" },
    { id: "ai", label: "DI sauga" },
    { id: "abuse", label: "Apsauga nuo piktnaudžiavimo ir išlaidų" },
    { id: "accounts", label: "Paskyros ir prisijungimas" },
    { id: "data", label: "Jūsų duomenų apsauga" },
    { id: "crawler", label: "Jūsų svetainės skaitymas" },
    { id: "headers", label: "Naršyklės apsaugos" },
    { id: "development", label: "Kaip jį kuriame ir eksploatuojame" },
    { id: "shared", label: "Ką galite padaryti jūs" },
    { id: "report", label: "Pranešti apie pažeidžiamumą" },
  ],
  body: Body,
};
