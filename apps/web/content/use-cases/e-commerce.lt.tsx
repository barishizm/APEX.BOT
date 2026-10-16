import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Ko klausia pirkėjai" },
  { id: "how", label: "Kaip Apex į juos atsako" },
  { id: "orders", label: "Klausimai apie konkrečius užsakymus" },
  { id: "setup", label: "Paruošimas parduotuvei" },
  { id: "costs", label: "Nuspėjamos išlaidos" },
  { id: "faq", label: "Klausimai" },
];

function Body() {
  return (
    <>
      <h2 id="questions">Ko klausia pirkėjai</h2>
      <p>
        Dauguma žinučių, kurias gauna internetinė parduotuvė, yra tų pačių kelių klausimų variantai, o atsakymai į juos jau
        yra pačios parduotuvės puslapiuose:
      </p>
      <ul>
        <li>Kiek laiko trunka pristatymas ir kiek jis kainuoja į mano miestą ar šalį?</li>
        <li>Ar galiu tai grąžinti, kiek dienų turiu ir kas apmoka grąžinimą?</li>
        <li>Kokį dydį rinktis? Iš ko tai pagaminta? Ar tinka šiam modeliui?</li>
        <li>Kokius mokėjimo būdus priimate? Ar galiu mokėti dalimis?</li>
        <li>Ar turite fizinę parduotuvę ir kada ji dirba?</li>
      </ul>
      <p>
        Pirkėjai to klausia naktimis ir savaitgaliais – prieš pat apsispręsdami pirkti. Neatsakytas klausimas tokiu metu
        dažnai reiškia paliktą pirkinių krepšelį.
      </p>

      <h2 id="how">Kaip Apex į juos atsako</h2>
      <p>
        Apex Bot perskaito jūsų produktų, pristatymo, grąžinimo ir DUK puslapius ir bet kuriuo paros metu pokalbių
        valdiklyje atsako jais remdamasis. Prie kiekvieno atsakymo pateikiama nuoroda į puslapį, iš kurio jis paimtas, kad
        pirkėjas galėtų patikrinti detales ir likti jūsų svetainėje.
      </p>
      <ul>
        <li>
          <strong>Jokių išgalvotų taisyklių.</strong> Apex teigia tik tai, kas parašyta jūsų puslapiuose. Jei grąžinimo
          puslapyje kuris nors atvejis neminimas, asistentas pasako, kad nežino, užuot sugalvojęs taisyklę, kurios jums tektų
          laikytis. <a href="/lt/grounded-answers">Kaip veikia pagrįsti atsakymai</a>.
        </li>
        <li>
          <strong>Penkios kalbos.</strong> Lietuvių, latvių, estų, anglų ir turkų: pirkėjai gauna atsakymą ta kalba, kuria
          rašo, o tai padeda parduotuvėms, prekiaujančioms keliose šalyse.
        </li>
        <li>
          <strong>Kontaktų rinkimas.</strong> Prieš pradedant pokalbį galite paprašyti vardo, el. pašto ar telefono numerio,
          kad klausimas virstų tolesniu bendravimu.
        </li>
        <li>
          <strong>Atrodo kaip jūsų parduotuvė.</strong> Prekės ženklo spalva, paleidimo mygtuko piktograma, pasisveikinimas ir
          siūlomi klausimai, pavyzdžiui, „Pristatymo terminai“ ar „Grąžinimo taisyklės“, – visa tai nustatymai su tiesiogine
          peržiūra.
        </li>
      </ul>

      <h2 id="orders">Klausimai apie konkrečius užsakymus</h2>
      <p>
        Apex atsako į klausimus, bet nieko nedaro. Jis negali rasti užsakymo, pakeisti adreso ar grąžinti pinigų ir neapsimes,
        kad gali. Į klausimą „Kur mano užsakymas Nr. 1234?“ jis gali paaiškinti, kaip veikia užsakymų sekimas pagal jūsų
        pagalbos puslapius, ir pasiūlyti <strong>perdavimą žmogui</strong>: pirkėjo klausimas ir visas pokalbis
        išsiunčiami jūsų komandai el. paštu, o atsakę jūs bendraujate su pirkėju tiesiogiai.
      </p>
      <p className="callout">
        Kadangi asistentas neturi prieigos prie jūsų parduotuvės administravimo ar klientų duomenų, lankytojas, bandantis juo
        manipuliuoti, negali per jį nieko pamatyti ar pakeisti. Blogiausiu atveju – vienas keistas pokalbis.
      </p>

      <h2 id="setup">Paruošimas parduotuvei</h2>
      <ol>
        <li>
          Pridėkite parduotuvės adresą kaip žinių šaltinį. Apex perskaito svetainės žemėlapį ir susietus puslapius iki jūsų
          puslapių limito. Įsitikinkite, kad įtraukti pristatymo, grąžinimo, mokėjimo ir dydžių lentelės puslapiai.
        </li>
        <li>
          Pridėkite tekstinį šaltinį apie tai, ko jūsų svetainėje dar nėra, pavyzdžiui, kurjerių paėmimo laiką ar tai, kaip
          elgiatės su pažeistomis siuntomis.
        </li>
        <li>Nustatykite pasisveikinimą ir du ar tris dažniausiai klientų užduodamus klausimus.</li>
        <li>
          Įklijuokite įterpimo kodą į savo temą. Yra išsamūs vadovai <a href="/lt/integrations/shopify">Shopify</a> ir{" "}
          <a href="/lt/integrations/wordpress">WordPress / WooCommerce</a> platformoms, o{" "}
          <a href="/lt/docs#platforms">dokumentacijoje</a> aprašytos Wix, Squarespace ir kitos.
        </li>
        <li>
          Skiltyje <em>Leidžiamos svetainės</em> pridėkite ir <code>https://jusuparduotuve.lt</code>, ir{" "}
          <code>https://www.jusuparduotuve.lt</code>. Valdiklis veikia tik jūsų nurodytais adresais.
        </li>
      </ol>

      <h2 id="costs">Nuspėjamos išlaidos</h2>
      <p>
        Užimta parduotuvė neturėtų gauti netikėtos sąskaitos. Kiekvienas asistentas turi užklausų ribą vienam lankytojui,
        didžiausią žinutės ilgį ir dienos žetonų biudžetą. Išnaudojus biudžetą, pokalbis iki kitos dienos pagal UTC siūlo
        perdavimą žmogui, užuot didinęs išlaidas. Beta laikotarpiu Apex nemokamas; vėlesni planai pateikti{" "}
        <a href="/lt/pricing">kainų puslapyje</a>.
      </p>

      <h2 id="faq">Klausimai</h2>
      <h3>Ar jis rekomenduos produktus?</h3>
      <p>
        Jis gali aprašyti ir palyginti produktus pagal tai, kas parašyta jūsų produktų puslapiuose, ir pateikti į juos
        nuorodas. Jis nemato realių atsargų ar kainų, kurių nėra perskaitytuose puslapiuose, todėl po didelių katalogo
        pakeitimų sinchronizuokite svetainę iš naujo.
      </p>
      <h3>Ar jis veikia atsiskaitymo puslapyje?</h3>
      <p>
        Jis veikia visur, kur jūsų tema įkelia įterpimo kodą. Kai kurios platformos, tarp jų ir Shopify, atsiskaitymo
        puslapiuose temos kodo neįkelia, todėl pokalbis rodomas parduotuvės puslapiuose, bet ne atsiskaitant.
      </p>
      <h3>Ar pirkėjų duomenys saugūs?</h3>
      <p>
        El. pašto adresai, telefono ir kortelių numeriai užmaskuojami prieš į žurnalus įrašant bet ką, pokalbiai ištrinami
        praėjus jūsų pasirinktam saugojimo laikotarpiui, o valdiklis nenaudoja slapukų. Žr.{" "}
        <a href="/lt/security">saugumą</a> ir <a href="/lt/privacy">privatumą</a>.
      </p>
    </>
  );
}

export const ecommerce: MarketingContent = {
  meta: {
    title: "DI pokalbių robotas elektroninės prekybos parduotuvėms",
    description:
      "Atsakykite į klausimus apie pristatymą, grąžinimą, dydžius ir mokėjimą 24/7 su DI pokalbių robotu, kuris naudoja tik jūsų parduotuvės puslapius. Penkiomis kalbomis.",
    crumb: "Elektroninė prekyba",
  },
  eyebrow: "Elektroninei prekybai",
  title: "DI pokalbių robotas internetinėms parduotuvėms, kuris niekada neišsigalvoja grąžinimo taisyklių",
  intro:
    "Atsakykite į klausimus apie pristatymą, grąžinimą, dydžius ir mokėjimą visą parą, remdamiesi savo parduotuvės puslapiais, lietuvių, latvių, estų, anglų ir turkų kalbomis.",
  toc: TOC,
  body: Body,
};
