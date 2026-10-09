import { CopySnippet } from "@/components/copy-snippet";
import { HeroDemo } from "@/components/hero-demo";
import { ThemeToggle } from "@/components/theme-toggle";

const steps = [
  { title: "Sitenizi ekleyin", text: "Adresinizi girin, Apex Bot sayfalarınızı okusun. PDF ve SSS de ekleyebilirsiniz." },
  { title: "Asistanı ayarlayın", text: "Adını, tonunu ve renklerini seçin; konuşmaması gereken konuları belirleyin." },
  { title: "Kodu yapıştırın", text: "Tek satırı sitenize ekleyin. Asistan yalnızca izin verdiğiniz alan adlarında çalışır." },
];

const principles = [
  { title: "Uydurmaz", text: "Sitenizde yanıt yoksa bunu söyler ve soruyu e-postayla size iletir." },
  { title: "Kaynağını gösterir", text: "Her yanıtın altında bilginin geldiği sayfa yer alır." },
  { title: "Türkçe ve İngilizce", text: "Ziyaretçi hangi dilde yazarsa o dilde yanıt verir." },
];

const snippet = `<script src="https://cdn.apex.bot/widget.js" data-site-key="apex_pk_…" async></script>`;

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">
        İçeriğe geç
      </a>

      <header className="bar">
        <a href="/" className="logo" aria-label="Apex Bot ana sayfa">
          Apex Bot
        </a>
        <nav className="bar__nav" aria-label="Ana menü">
          <a href="#nasil" className="bar__link">
            Nasıl çalışır
          </a>
          <a href="/giris" className="bar__link">
            Giriş yap
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <h1>Sitenizi bilen asistan.</h1>
          <p className="lede">
            Apex Bot, ziyaretçilerinizin sorularını yalnızca sitenizdeki bilgilerle yanıtlar. Bilmediğinde uydurmaz.
          </p>
          <div className="actions">
            <a className="btn btn--primary" href="/kayit">
              Ücretsiz başla
            </a>
            <a className="btn btn--ghost" href="#nasil">
              Nasıl çalışır
            </a>
          </div>
          <HeroDemo />
        </section>

        <section id="nasil" className="block" aria-labelledby="nasil-baslik">
          <h2 id="nasil-baslik">Beş dakikada kurulur.</h2>
          <ol className="grid3 steps">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="steps__n" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <CopySnippet code={snippet} />
        </section>

        <section className="block" aria-labelledby="ilke-baslik">
          <h2 id="ilke-baslik">Ziyaretçiniz yanıta güvenebilir.</h2>
          <ul className="grid3 principles">
            {principles.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="closing">
          <h2>İlk asistanınızı bugün kurun.</h2>
          <a className="btn btn--primary" href="/kayit">
            Ücretsiz başla
          </a>
        </section>
      </main>

      <footer className="foot">
        <span>© {new Date().getFullYear()} Apex Bot</span>
        <nav aria-label="Alt menü">
          <a href="/gizlilik">Gizlilik ve KVKK</a>
          <a href="mailto:merhaba@apex.bot">merhaba@apex.bot</a>
        </nav>
      </footer>
    </>
  );
}
