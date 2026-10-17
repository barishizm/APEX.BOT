import { CONTACT_EMAIL } from "@/components/site-nav";
import type { MarketingContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="what">Kas yra Apex Bot</h2>
      <p>
        Apex Bot – dirbtinio intelekto klientų aptarnavimo asistentas svetainėms. Jis perskaito jūsų puslapius, sukuria iš
        jų privačią žinių bazę ir bet kuriuo paros metu atsako į lankytojų klausimus pokalbių valdiklyje lietuvių, latvių,
        estų, anglų ir turkų kalbomis. Jis atsako tik remdamasis tuo, ką jam pateikėte, nurodo puslapį, iš kurio paimtas
        atsakymas, ir pasako, kai ko nors nežino.
      </p>
      <p>
        Šiuo metu vyksta beta testavimas. Kol jis trunka, visos funkcijos nemokamos, o užsiregistruoti gali{" "}
        <a href="/lt/signup">kiekvienas</a>.
      </p>

      <h2 id="why">Kodėl jį sukūrėme</h2>
      <p>
        Į daugumą klausimų, kuriuos verslas gauna internetu, jau atsakyta kažkur jo paties svetainėje: pristatymo terminai,
        grąžinimo taisyklės, darbo laikas, kas įeina į planą. Lankytojai vis tiek klausia, dažnai ne darbo valandomis, o
        daugelis išeina, kai niekas neatsako. Bendrosios paskirties pokalbių robotai šią spragą užpildo prastai: jie spėlioja,
        išsigalvoja taisykles ir užtikrintai kalba apie tai, ko verslas niekada nesakė.
      </p>
      <blockquote>
        <p>
          „Sukūrėme Apex tam, kad kiekvienas klientas bet kuriuo paros metu akimirksniu gautų tikslų atsakymą, o klientų
          aptarnavimo komandos pagaliau galėtų susitelkti į sudėtingus atvejus.“
        </p>
        <p>– Mahmut Barış Akıntı, įkūrėjas ir generalinis direktorius</p>
      </blockquote>

      <h2 id="founder">Kas už jo stovi</h2>
      <p>
        Apex Bot įkūrė <strong>Mahmut Barış Akıntı</strong>, kuris vadovauja įmonei kaip generalinis direktorius ir kuria
        produktą.
      </p>

      <h2 id="principles">Kokių principų laikomės</h2>
      <ul>
        <li>
          <strong>Jūsų turinys, o ne internetas.</strong> Asistentas atsako remdamasis jūsų puslapiais ir pridėtu tekstu – ir
          niekuo kitu. Išsamiau apie tai – puslapyje <a href="/lt/grounded-answers">„Kaip veikia pagrįsti atsakymai“</a>.
        </li>
        <li>
          <strong>Sukurtas taip, lyg bus atakuojamas.</strong> Viešas pokalbių robotas yra taikinys, todėl kiekvienai
          svetainei pagal numatytuosius nustatymus įjungtas susiejimas su domenu, apsauga nuo raginimų injekcijų, užklausų
          ribos ir dienos biudžetai. Mūsų <a href="/lt/security">saugumo puslapyje</a> išvardyta, ką produktas daro jau šiandien.
        </li>
        <li>
          <strong>Privatumas pagal numatytuosius nustatymus.</strong> Asmens duomenys žurnaluose užmaskuojami, pokalbiai
          ištrinami praėjus jūsų pasirinktam laikotarpiui, o jūsų duomenys nenaudojami modeliams apmokyti, nebent tam
          pritarsite. <a href="/lt/privacy">Privatumo politika</a> parengta laikantis ES Bendrojo duomenų apsaugos reglamento
          (BDAR) ir Turkijos KVKK.
        </li>
        <li>
          <strong>Vietinės kalbos, ne tik anglų.</strong> Lietuvių, latvių, estų, anglų ir turkų kalbos visiškai palaikomos –
          tiek atsakymuose, tiek kiekviename valdiklio žodyje.
        </li>
        <li>
          <strong>Jis atsako, bet nieko nedaro.</strong> Apex negali pateikti užsakymų, keisti paskyrų ar duoti pažadų. Kai
          lankytojui reikia žmogaus, jis perduoda pokalbį jūsų komandai el. paštu.
        </li>
      </ul>

      <h2 id="infrastructure">Kur jis veikia</h2>
      <p>
        Pokalbių API veikia Render platformoje Frankfurte, Vokietijoje. Svetainę ir valdymo skydelį teikia Vercel, o
        paskyros ir nustatymai saugomi valdomoje PostgreSQL duomenų bazėje Supabase platformoje. Visas paslaugų teikėjų
        sąrašas ir tai, ką kiekvienas iš jų mato, pateikti <a href="/lt/privacy">privatumo politikoje</a>. Kiekvienos
        paslaugos būseną realiuoju laiku galite patikrinti <a href="/lt/status">būsenos puslapyje</a>.
      </p>

      <h2 id="contact">Kontaktai</h2>
      <p>
        Dėl klausimų, partnerystės ar žiniasklaidos rašykite adresu <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        Perskaitome kiekvieną laišką.
      </p>
    </>
  );
}

export const about: MarketingContent = {
  meta: {
    title: "Apie mus",
    description:
      "Kodėl sukūrėme Apex Bot – DI klientų aptarnavimo asistentą, atsakantį tik remiantis jūsų svetaine, – ir kokių principų laikomės: pagrįstumo, saugumo ir privatumo.",
    crumb: "Apie mus",
  },
  eyebrow: "Apie mus",
  title: "DI asistentas, kuris sako tik tai, ką sako jūsų svetainė",
  intro: "Apex Bot padeda verslui atsakyti kiekvienam lankytojui bet kuriuo paros metu ir nieko neišsigalvojant.",
  body: Body,
};
