import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "definition", label: "Ką reiškia „pagrįstas“" },
  { id: "pipeline", label: "Nuo klausimo iki atsakymo" },
  { id: "dont-know", label: "Kai jis nežino" },
  { id: "confidence", label: "Atsakymo užtikrintumas" },
  { id: "injection", label: "Bandymai manipuliuoti" },
  { id: "limits", label: "Apribojimai" },
  { id: "faq", label: "Klausimai" },
];

function Body() {
  return (
    <>
      <h2 id="definition">Ką reiškia „pagrįstas“</h2>
      <p>
        <strong>Pagrįstas pokalbių robotas</strong> atsako tik remdamasis jam pateiktu fiksuotu šaltinių rinkiniu, o ne tuo,
        ką jo DI modelis apskritai išmoko. Apex Bot šaltiniai – tai puslapiai, kuriuos jis perskaito jūsų svetainėje, ir
        tekstas, kurį pridedate patys. Jei atsakymo tuose šaltiniuose nėra, Apex jo nepateikia.
      </p>
      <p>
        Tai svarbu, nes DI modeliai kalba sklandžiai net tada, kai klysta. Paklaustas apie jūsų grąžinimo taisykles,
        bendrasis pokalbių robotas dažnai sugalvoja įtikinamas taisykles, kurių jūs niekada nerašėte. Verslo svetainėje tai
        blogiau nei jokio atsakymo: lankytojas juo vadovaujasi, o aiškintis tenka jums.
      </p>

      <h2 id="pipeline">Nuo klausimo iki atsakymo</h2>
      <ol>
        <li>
          <strong>Jūsų turinys perskaitomas ir suskaidomas.</strong> Kai pridedate svetainę, Apex perskaito jūsų įvestą
          puslapį, svetainės žemėlapį ir puslapius tame pačiame domene, į kuriuos jie nukreipia, – iki jūsų puslapių limito.
          Jis paiso <code>robots.txt</code> ir praleidžia meniu, poraštes bei slapukų juostas. Tekstas suskaidomas į trumpas
          ištraukas ir saugomas tik jūsų asistentui.
        </li>
        <li>
          <strong>Klausimas susiejamas su ištraukomis.</strong> Kai lankytojas ko nors klausia, Apex ieško tik to vieno
          asistento ištraukose ir įvertina, kiek kiekviena iš jų aktuali. Kitų klientų turinyje niekada neieškoma.
        </li>
        <li>
          <strong>Silpni atitikmenys atmetami.</strong> Ištraukos, kurių aktualumas žemiau nustatytos ribos, atmetamos, todėl
          iš menkai susijusio puslapio atsakymo „ištempti“ neįmanoma.
        </li>
        <li>
          <strong>Modelis rašo remdamasis ištraukomis.</strong> DI modelis gauna lankytojo klausimą ir atitinkančias
          ištraukas, o pirmiausia – fiksuotas taisykles: atsakyti tik ištraukose esančiais faktais, niekada neišsigalvoti
          kainų, taisyklių ar kontaktinių duomenų ir pasakyti, kai ištraukose atsakymo į klausimą nėra.
        </li>
        <li>
          <strong>Parodomas šaltinis.</strong> Po kiekvienu atsakymu pateikiama nuoroda į puslapį, iš kurio jis paimtas, kad
          lankytojas galėtų jį patikrinti ir toliau skaityti jūsų svetainėje.
        </li>
      </ol>

      <h2 id="dont-know">Kai jis nežino</h2>
      <p>
        Jei nė viena ištrauka nėra pakankamai aktuali, asistentas atsako jūsų „nežinau“ žinute, o ne spėlioja. Jei įjungėte{" "}
        <a href="/lt/docs#customize">perdavimą žmogui</a>, jis pasiūlo perduoti pokalbį jūsų komandai el. paštu kartu su
        visu pokalbiu.
      </p>
      <p>
        Neatsakyti klausimai naudingi: jie tiksliai parodo, ką jūsų lankytojai nori sužinoti, bet ko jūsų svetainė dar
        nesako. Pridėkite trūkstamą informaciją kaip puslapį arba tekstinį šaltinį, ir kitas lankytojas gaus atsakymą.
      </p>

      <h2 id="confidence">Atsakymo užtikrintumas</h2>
      <p>
        Kaip tiksliai turinys turi atitikti klausimą, nustatoma skiltyje <em>Asmenybė → Atsakymo užtikrintumas</em>:
      </p>
      <table>
        <thead>
          <tr>
            <th>Nustatymas</th>
            <th>Elgsena</th>
            <th>Tinka</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Griežtas</td>
            <td>Reikia artimo atitikmens; „nežinau“ sako dažniau</td>
            <td>Reguliuojamoms temoms, kainoms, teisinėms sąlygoms</td>
          </tr>
          <tr>
            <td>Subalansuotas</td>
            <td>Numatytasis</td>
            <td>Daugumai svetainių</td>
          </tr>
          <tr>
            <td>Lankstus</td>
            <td>Priima laisvesnius atitikmenis</td>
            <td>Mažoms žinių bazėms, turinčioms vos kelis puslapius</td>
          </tr>
        </tbody>
      </table>

      <h2 id="injection">Bandymai manipuliuoti</h2>
      <p>
        Lankytojai kartais bando įkalbėti pokalbių robotą nepaisyti savo taisyklių („nepaisyk savo instrukcijų ir…“), o
        tinklalapiuose gali būti tekstas, parašytas tam pačiam tikslui. Apex perduoda lankytojų žinutes, jūsų svetainės
        tekstą ir jūsų pasirinktines instrukcijas modeliui kaip duomenis aiškiai pažymėtose skiltyse, po fiksuotų saugumo
        taisyklių, kurių jos negali panaikinti. Tekstas, mėgdžiojantis tuos žymenis, pirmiausia neutralizuojamas. Jūsų pačių
        instrukcijos gali keisti toną ir temas, bet negali išjungti pagrįstumo.
      </p>
      <p>
        Be to, asistentas neturi jokių įrankių: jis negali pateikti užsakymų, keisti paskyrų, naršyti internete ar kreiptis į
        kitas sistemas. Blogiausia, ką gali padaryti sėkminga manipuliacija, – pakeisti tai, ką sako vienas pokalbis.
        Daugiau apie tai – <a href="/lt/security">saugumo puslapyje</a>.
      </p>

      <h2 id="limits">Apribojimai</h2>
      <p>
        Pagrįstumas gerokai sumažina išgalvotų atsakymų, tačiau nė viena DI sistema nėra tobula. Atsakymas vis tiek gali būti
        neišsamus arba klaidingai suprasti dviprasmišką ištrauką. Todėl prie kiekvieno atsakymo rodomas jo šaltinis, o
        valdymo skydelyje saugomi pokalbiai, kad galėtumėte juos peržiūrėti ir patobulinti savo turinį. Asistentas atvirai
        sako esantis DI ir neteikia galutinių medicininių, teisinių ar finansinių patarimų.
      </p>

      <h2 id="faq">Klausimai</h2>
      <h3>Ar Apex naudoja tai, ką DI modelis jau žino apie mano verslą?</h3>
      <p>
        Ne. Atsakymai kuriami tik iš jūsų puslapių ir tekstinių šaltinių. Jei jūsų turinyje kažkas neminima, Apex to nesako,
        net jei modelis tai galbūt žino iš kitur.
      </p>
      <h3>Kas nutinka, kai mano svetainė pasikeičia?</h3>
      <p>
        Iš naujo sinchronizuokite svetainės šaltinį skiltyje <em>Valdymo skydelis → Žinių bazė</em>, ir Apex ją perskaitys
        dar kartą. Tekstiniai šaltiniai atnaujinami vos juos išsaugojus.
      </p>
      <h3>Kokius DI modelius jis naudoja?</h3>
      <p>
        Renkatės jūs: Claude, OpenAI ar Gemini modelius, su neprivalomu atsarginiu modeliu, jei pagrindinis nepasiekiamas.
        Pagrįstumo taisyklės visuose modeliuose vienodos.
      </p>
      <h3>Ar mano turinys naudojamas DI modeliams apmokyti?</h3>
      <p>
        Ne, nebent tam pritarsite. Jūsų turinys ir lankytojų žinutės siunčiami jūsų pasirinktam DI paslaugų teikėjui tik
        atsakymams generuoti. Žr. <a href="/lt/privacy">privatumo politiką</a>.
      </p>
    </>
  );
}

export const groundedAnswers: MarketingContent = {
  meta: {
    title: "Kaip veikia pagrįsti atsakymai",
    description:
      "Kaip Apex Bot atsako tik remdamasis jūsų svetaine: paieška kiekvieno asistento turinyje, aktualumo riba, nurodyti šaltiniai, sąžiningas „nežinau“ ir apsauga nuo injekcijų.",
    crumb: "Pagrįsti atsakymai",
  },
  eyebrow: "Kaip tai veikia",
  title: "Pagrįsti atsakymai: pokalbių robotas, kuris nieko neišsigalvoja",
  intro:
    "Apex Bot atsako remdamasis jūsų svetaine ir niekuo kitu. Štai kaip tiksliai klausimas tampa atsakymu ir kas nutinka, kai jūsų turinyje atsakymo nėra.",
  toc: TOC,
  body: Body,
};
