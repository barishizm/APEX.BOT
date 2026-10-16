import type { MarketingContent } from "../types";

const TOC: MarketingContent["toc"] = [
  { id: "questions", label: "Üzerinizden aldığı sorular" },
  { id: "sources", label: "Dokümantasyon, fiyatlar ve yardım merkezi" },
  { id: "in-app", label: "Ürününüzün içinde" },
  { id: "handoff", label: "Bir insan gerektiğinde" },
  { id: "safety", label: "Herkese açık sitede güvenli" },
  { id: "faq", label: "Sorular" },
];

const IN_APP_EXAMPLE = `<script>
  // Sohbeti kendi "Yardım" düğmenizden açın
  document.querySelector("#help").addEventListener("click", () => Apex.open())

  // Fiyatlandırma ipucundan ziyaretçi adına soru sorun
  Apex.send("Pro planına neler dahil?")

  // Giriş yapmış kullanıcı için devir ve iletişim formlarını önceden doldurun
  Apex.identify({ name: "Ada", email: "ada@example.com" })

  // Sohbet olaylarını analitik aracınıza gönderin
  Apex.on("handoff", () => analytics.track("support_handoff"))
</script>`;

function Body() {
  return (
    <>
      <h2 id="questions">Üzerinizden aldığı sorular</h2>
      <p>
        Yazılım şirketleri satıştan önce ve sonra her gün aynı soruları yanıtlar. Çoğunun yanıtı dokümantasyonda veya
        fiyatlandırma sayfasında vardır, ama ziyaretçiler ya bulamaz ya da aramak istemez:
      </p>
      <ul>
        <li>
          <strong>Satış öncesi:</strong> X ile entegre oluyor mu? Ücretsiz plan var mı? Pro ile Business arasındaki fark ne?
          Veriler nerede saklanıyor?
        </li>
        <li>
          <strong>İlk kullanım:</strong> Ekibimi nasıl davet ederim? API anahtarımı nerede bulurum? Alan adımı nasıl
          bağlarım?
        </li>
        <li>
          <strong>Sorun giderme:</strong> Webhook neden tetiklenmiyor? Bu hata ne anlama geliyor? İki adımlı doğrulamayı
          nasıl sıfırlarım?
        </li>
      </ul>
      <p>
        Apex Bot bu soruları kendi içeriğinizden, doğrudan ilgili sayfanın bağlantısıyla yanıtlar; ekibiniz de zamanını
        gerçekten bir insan gerektiren sorulara ayırır.
      </p>

      <h2 id="sources">Dokümantasyon, fiyatlar ve yardım merkezi</h2>
      <p>
        Apex'e pazarlama sitenizi, dokümantasyonunuzu ve yardım merkezinizi gösterin. Site haritanızı ve aynı alan
        adındaki bağlantılı sayfaları okur, <code>robots.txt</code> kurallarına uyar; menüleri, alt bilgileri ve çerez
        bildirimlerini atlar. Destek ekibinizin sık verdiği yanıtlar gibi henüz herkese açık olmayan bilgiler için metin
        kaynakları ekleyin.
      </p>
      <p>
        Yanıtlar yalnızca bu kaynaklardan gelir. Dokümantasyonunuz bir soruyu karşılamıyorsa Apex, bir API parametresi
        tahmin etmek veya yol haritanızdaki bir özelliği vaat etmek yerine bilmediğini söyler.{" "}
        <a href="/tr/grounded-answers">Kaynağa dayalı yanıtlar nasıl çalışır?</a>
      </p>

      <h2 id="in-app">Ürününüzün içinde</h2>
      <p>
        Aynı widget web uygulamanızda da çalışır. React veya Next.js gibi tek sayfalı uygulamalarda betiği kök layout'ta
        bir kez yükleyin; konuşma istemci tarafı sayfa geçişlerinde korunur.{" "}
        <a href="/tr/docs#javascript-api">JavaScript API</a> ile kendi kodunuzdan yönetebilirsiniz:
      </p>
      <pre>
        <code>{IN_APP_EXAMPLE}</code>
      </pre>
      <p>
        Widget'ı faturalandırma sayfalarınız gibi belirli yollarda <em>Davranış → Bu sayfalarda gizle</em> ayarıyla
        gizleyebilirsiniz.
      </p>

      <h2 id="handoff">Bir insan gerektiğinde</h2>
      <p>
        Hesaba özel sorunlar ekibinizi gerektirir. İnsana devir açıksa ziyaretçi “Bir insanla konuş” seçeneğini
        kullanabilir: soru ve konuşmanın tamamı destek adresinize e-postayla gider, siz yanıtladığınızda doğrudan onunla
        yazışırsınız. Asistanın yanıtlayamadığı sorular, bir sonraki hangi dokümanı yazmanız gerektiğini gösterir.
      </p>

      <h2 id="safety">Herkese açık sitede güvenli</h2>
      <ul>
        <li>
          <strong>Alan adına kilitli.</strong> Herkese açık site anahtarı yalnızca izin verdiğiniz alan adlarında çalışır;
          kopyalanan kod başka yerde işe yaramaz.
        </li>
        <li>
          <strong>İşlem yapmaz.</strong> Asistan API'nizi çağıramaz, hesap değiştiremez veya kod çalıştıramaz. Bir prompt
          injection girişimi en fazla tek bir sohbette söylenenleri değiştirebilir.
        </li>
        <li>
          <strong>Bütçeler.</strong> Ziyaretçi başına hız sınırları ve günlük token bütçesi, bir betik widget'ı
          zorlasa bile kullanımı öngörülebilir tutar.
        </li>
        <li>
          <strong>Model sizin seçiminiz.</strong> Claude, OpenAI veya Gemini; otomatik yedek modelle.
        </li>
      </ul>
      <p>
        Ayrıntılar <a href="/tr/security">güvenlik sayfasında</a>.
      </p>

      <h2 id="faq">Sorular</h2>
      <h3>Belirli bir kullanıcının hesabıyla ilgili soruları yanıtlayabilir mi?</h3>
      <p>
        Hayır. Apex'in ürününüzün verilerine erişimi yoktur. <code>Apex.identify()</code> yalnızca kullanıcının adını ve
        e-postasını devir ve iletişim formlarına önceden doldurur, böylece tekrar yazmak zorunda kalmaz.
      </p>
      <h3>Yeni sürüm çıkardığımızda güncel kalır mı?</h3>
      <p>
        Yeni dokümanları yayınladıktan sonra web sitesi kaynağını yeniden senkronize edin, Apex onları tekrar okur. Metin
        kaynakları kaydettiğiniz anda güncellenir.
      </p>
      <h3>Hangi konularda konuşacağını sınırlayabilir miyim?</h3>
      <p>
        Evet. Üslup için kendi talimatlarınızı ekleyin ve hukuki sorular veya henüz çıkmamış özellikler gibi kibarca
        reddetmesi gereken konuları listeleyin.
      </p>
    </>
  );
}

export const saas: MarketingContent = {
  meta: {
    title: "SaaS için yapay zekâ destek chatbotu",
    description:
      "Satış öncesi, ilk kullanım ve nasıl yapılır sorularını dokümantasyonunuzdan ve yardım merkezinizden kaynak bağlantılarıyla yanıtlayın.",
    crumb: "SaaS",
  },
  eyebrow: "SaaS için",
  title: "Dokümantasyonunuzdan yanıt veren SaaS destek chatbotu",
  intro:
    "Satış öncesi, ilk kullanım ve nasıl yapılır sorularını kendi dokümantasyonunuzdan, fiyatlandırma sayfanızdan ve yardım merkezinizden; hem sitenizde hem uygulamanızın içinde yanıtlayın.",
  toc: TOC,
  body: Body,
};
