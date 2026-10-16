import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Mida ostjad küsivad" },
  { id: "how", label: "Kuidas Apex neile vastab" },
  { id: "orders", label: "Küsimused konkreetsete tellimuste kohta" },
  { id: "setup", label: "Seadistamine e-poe jaoks" },
  { id: "costs", label: "Prognoositavad kulud" },
  { id: "faq", label: "Küsimused" },
];

function Body() {
  return (
    <>
      <h2 id="questions">Mida ostjad küsivad</h2>
      <p>
        Enamik sõnumeid, mida e-pood saab, on samade mõne küsimuse variatsioonid ja vastused neile on juba poe enda lehtedel
        olemas:
      </p>
      <ul>
        <li>Kui kaua tarne aega võtab ja kui palju see minu linna või riiki maksab?</li>
        <li>Kas saan selle tagastada, mitu päeva mul on ja kes tagastuse eest maksab?</li>
        <li>Millise suuruse peaksin valima? Millest see on tehtud? Kas see sobib selle mudeliga?</li>
        <li>Milliseid makseviise te aktsepteerite? Kas saan maksta osamaksetega?</li>
        <li>Kas teil on füüsiline kauplus ja millal see avatud on?</li>
      </ul>
      <p>
        Ostjad küsivad seda öösiti ja nädalavahetustel – vahetult enne ostuotsust. Vastuseta küsimus sel hetkel tähendab sageli
        pooleli jäänud ostukorvi.
      </p>

      <h2 id="how">Kuidas Apex neile vastab</h2>
      <p>
        Apex Bot loeb teie toote-, tarne-, tagastus- ja KKK lehti ning vastab nende põhjal vestlusvidinas igal kellaajal. Iga
        vastuse juures on link lehele, kust see pärineb, et ostja saaks üksikasjad üle kontrollida ja teie saidile jääda.
      </p>
      <ul>
        <li>
          <strong>Väljamõeldud tingimusi pole.</strong> Apex väidab ainult seda, mis teie lehtedel kirjas on. Kui teie
          tagastuslehel mõnda juhtumit ei mainita, ütleb assistent, et ei tea, selle asemel et mõelda välja reegel, mida peaksite
          täitma. <a href="/et/grounded-answers">Kuidas põhjendatud vastused töötavad</a>.
        </li>
        <li>
          <strong>Viis keelt.</strong> Eesti, läti, leedu, inglise ja türgi: ostjad saavad vastuse selles keeles, milles nad
          kirjutavad, mis aitab mitmes riigis müüvaid e-poode.
        </li>
        <li>
          <strong>Kontaktide kogumine.</strong> Soovi korral küsige enne vestluse algust nime, e-posti või telefoninumbrit, et
          küsimusest saaks edasine suhtlus.
        </li>
        <li>
          <strong>Näeb välja nagu teie pood.</strong> Brändi värv, avamisnupu ikoon, tervitus ja soovitatud küsimused, nagu
          „Tarneajad“ või „Tagastustingimused“, on kõik reaalajas eelvaatega seaded.
        </li>
      </ul>

      <h2 id="orders">Küsimused konkreetsete tellimuste kohta</h2>
      <p>
        Apex vastab küsimustele, kuid ei tegutse. See ei saa tellimust otsida, aadressi muuta ega raha tagastada ega teeskle,
        et suudab. Küsimuse „Kus on minu tellimus nr 1234?“ puhul saab see teie abilehtede põhjal selgitada, kuidas tellimuse
        jälgimine toimib, ja pakkuda <strong>inimesele üleandmist</strong>: ostja küsimus ja kogu vestlus saadetakse e-postiga
        teie meeskonnale ning vastates suhtlete ostjaga otse.
      </p>
      <p className="callout">
        Kuna assistendil puudub juurdepääs teie e-poe haldusele ja kliendiandmetele, ei saa külastaja, kes üritab sellega
        manipuleerida, selle abil midagi näha ega muuta. Halvimal juhul on tulemuseks üks veider vestlus.
      </p>

      <h2 id="setup">Seadistamine e-poe jaoks</h2>
      <ol>
        <li>
          Lisage oma e-poe aadress teadmusallikaks. Apex loeb saidikaardi ja lingitud lehed kuni teie lehtede piirmäärani.
          Veenduge, et tarne-, tagastus-, makse- ja suurustabeli lehed on kaasatud.
        </li>
        <li>
          Lisage tekstiallikas kõige kohta, mida teie veebisaidil veel pole, näiteks kullerite vastuvõtuajad või see, kuidas
          kahjustatud pakkidega toimite.
        </li>
        <li>Määrake tervitus ja kaks või kolm küsimust, mida kliendid kõige sagedamini esitavad.</li>
        <li>
          Kleepige manustamiskood oma teemasse. Üksikasjalikud juhendid on olemas platvormidele{" "}
          <a href="/et/integrations/shopify">Shopify</a> ja <a href="/et/integrations/wordpress">WordPress / WooCommerce</a>{" "}
          ning <a href="/et/docs#platforms">dokumentatsioon</a> käsitleb Wixi, Squarespace'i ja teisi.
        </li>
        <li>
          Lisage jaotises <em>Lubatud veebisaidid</em> nii <code>https://teiepood.ee</code> kui ka{" "}
          <code>https://www.teiepood.ee</code>. Vidin töötab ainult teie loetletud aadressidel.
        </li>
      </ol>

      <h2 id="costs">Prognoositavad kulud</h2>
      <p>
        Tihedalt külastatud pood ei peaks saama üllatusarvet. Igal assistendil on külastajapõhine päringupiirang, sõnumi
        maksimaalne pikkus ja päevane tokenieelarve. Kui eelarve on ära kasutatud, pakub vestlus kulude kasvatamise asemel kuni
        järgmise UTC päevani inimesele üleandmist. Beetaversiooni ajal on Apex tasuta; hilisemad paketid leiate{" "}
        <a href="/et/pricing">hinnalehelt</a>.
      </p>

      <h2 id="faq">Küsimused</h2>
      <h3>Kas see soovitab tooteid?</h3>
      <p>
        See saab tooteid kirjeldada ja võrrelda teie tootelehtede põhjal ning neile linkida. See ei näe reaalajas laoseisu ega
        hindu, mida loetud lehtedel pole, seega sünkroonige veebisait pärast suuri kataloogimuudatusi uuesti.
      </p>
      <h3>Kas see töötab kassalehel?</h3>
      <p>
        See töötab kõikjal, kus teie teema manustamiskoodi laadib. Mõned platvormid, nende hulgas Shopify, ei laadi kassalehtedel
        teema koodi, seega on vestlus nähtav poe lehtedel, kuid mitte maksmise ajal.
      </p>
      <h3>Kas ostjate andmed on kaitstud?</h3>
      <p>
        E-posti aadressid, telefoni- ja kaardinumbrid maskeeritakse enne, kui midagi logidesse kirjutatakse, vestlused
        kustutatakse pärast teie valitud säilitusaega ja vidin ei kasuta küpsiseid. Vaadake{" "}
        <a href="/et/security">turvalisust</a> ja <a href="/et/privacy">privaatsust</a>.
      </p>
    </>
  );
}

export const ecommerce: MarketingContent = {
  meta: {
    title: "TI vestlusrobot e-poodidele",
    description:
      "Vastake tarne, tagastuse, suuruste ja maksete küsimustele 24/7 TI vestlusrobotiga, mis kasutab ainult teie e-poe enda lehti. Viies keeles.",
    crumb: "E-kaubandus",
  },
  eyebrow: "E-kaubandusele",
  title: "TI vestlusrobot e-poodidele, mis ei mõtle kunagi välja tagastustingimusi",
  intro:
    "Vastake tarne, tagastuse, suuruste ja maksete küsimustele ööpäev läbi oma e-poe lehtede põhjal eesti, läti, leedu, inglise ja türgi keeles.",
  toc: TOC,
  body: Body,
};
