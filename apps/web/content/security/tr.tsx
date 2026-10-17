import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="overview">Kısaca</h2>
      <p>
        Web sitenizdeki bir sohbet botu herkese açıktır; bu yüzden Apex'i birilerinin onu kötüye kullanmaya çalışacağı varsayımıyla
        geliştirdik: faturanızı şişirmek, söylememesi gerekeni söyletmek, başka bir müşterinin verisini okumak ya da bir hesabı
        ele geçirmek için. Aşağıdakiler varsayılan olarak açık olan korumalardır. Bu sayfa hedefleri değil, ürünün bugün yaptığı
        şeyleri anlatır.
      </p>

      <h2 id="widget">Web siteniz ve sohbet widget'ı</h2>
      <ul>
        <li>
          <strong>Yalnızca sizin sitelerinizde çalışır.</strong> Her asistanın herkese açık bir site anahtarı vardır, ancak sohbet
          API'si bunu yalnızca sizin listelediğiniz web sitelerinden kabul eder. Başka kaynaklardan gelen istekler ve tarayıcı ön
          kontrolleri reddedilir; kopyalanmış bir yerleştirme kodu başka yerde hiçbir şey yapmaz. Site anahtarı bir sır değildir
          ve hesabınıza erişim vermez.
        </li>
        <li>
          <strong>Sayfanızdan yalıtılmıştır.</strong> Widget Shadow DOM içinde çizilir; sitenizin CSS'i onu bozamaz ve sayfanızı
          okumaz.
        </li>
        <li>
          <strong>Çerez yok, izleme yok.</strong> Widget çerez ve üçüncü taraf izleyici kullanmaz. Ayarınıza göre yalnızca
          konuşma kimliğini hatırlar: sekme için, tarayıcı için ya da hiç.
        </li>
        <li>
          <strong>Yalnızca küçük istekler.</strong> Her istek 16 KB ile sınırlıdır, mesajların uzunluğu sınırlıdır (varsayılan 1.000
          karakter, ayarlanabilir) ve bir konuşmanın azami uzunluğu vardır.
        </li>
        <li>
          <strong>Yanıtlar önbelleğe alınmaz</strong> ve <code>nosniff</code> ile gönderilir; böylece tarayıcı veya CDN bir
          ziyaretçinin sohbetini saklayamaz ya da farklı yorumlayamaz.
        </li>
      </ul>

      <h2 id="ai">Yapay zekâ güvenliği</h2>
      <ul>
        <li>
          <strong>Yanıtlar içeriğinizden gelir.</strong> Asistana yalnızca Apex'e verdiğiniz sayfalarda ve metinlerde bulunan
          bilgilerle yanıt vermesi, fiyat, politika veya iletişim bilgisi uydurmaması ve ilgili bir şey bulamazsa bilmediğini
          söylemesi talimatı verilir. Bilmediğinde, konuşmayı ekibinize devretmeyi önerebilir.
        </li>
        <li>
          <strong>Prompt injection'a karşı sertleştirilmiştir.</strong> Ziyaretçilerin mesajları, web sitenizin metni ve sizin
          özel talimatlarınız modele açıkça işaretlenmiş bölümlerde veri olarak iletilir; sabit güvenlik kuralları önce gelir ve
          bunlar tarafından geçersiz kılınamaz. Bölüm işaretlerimizi taklit eden metinler modele ulaşmadan etkisizleştirilir.
          Kendi talimatlarınız tonu ve konuları şekillendirebilir, ancak temellendirmeyi veya güvenliği kapatamaz.
        </li>
        <li>
          <strong>Araç yok, eylem yok.</strong> Asistan sipariş veremez, hesap değiştiremez, kod çalıştıramaz, web'de gezemez veya
          başka sistemleri çağıramaz. Başarılı bir manipülasyonun yapabileceği en kötü şey, tek bir sohbetin söylediğini
          değiştirmektir.
        </li>
        <li>
          <strong>Yapay zekâ olduğu konusunda dürüsttür</strong> ve kesin tıbbi, hukuki veya mali tavsiye vermez. Nazikçe
          reddetmesi gereken konuları da listeleyebilirsiniz.
        </li>
        <li>
          <strong>Müşteri başına yalıtılmıştır.</strong> Arama yalnızca soru sorulan asistanın içeriğinde yapılır; bir müşterinin
          bilgisi hiçbir zaman başkasının sitesinde yanıt vermek için kullanılmaz.
        </li>
      </ul>

      <h2 id="abuse">Kötüye kullanım ve maliyet koruması</h2>
      <ul>
        <li>
          <strong>Ziyaretçi başına hız sınırı</strong>: varsayılan olarak dakikada 15 mesaj, asistan başına ayarlanabilir (1 ile
          120 arası); bunun yanında asistan başına bir tavan vardır, böylece tek bir kişi veya betik hakkınızı tüketemez.
        </li>
        <li>
          <strong>Asistan başına günlük jeton bütçesi</strong> (varsayılan 2 milyon, en fazla 20 milyon); veritabanında sayılır,
          yeniden başlatmalardan etkilenmez. Bütçe bittiğinde asistan, maliyeti artırmak yerine bir sonraki UTC gününe kadar
          yanıt vermeyi durdurur.
        </li>
        <li>
          <strong>E-posta spam aracı olarak kullanılamaz.</strong> Devir talepleri ziyaretçi, asistan ve alıcı başına saatlik ve
          günlük olarak sınırlıdır. Bir devir adresine e-posta göndermeden önce adrese giden bir kodla doğrulanması gerekir;
          böylece kimse sistemi başka birinin gelen kutusuna yöneltemez.
        </li>
        <li>
          <strong>Bot kontrolleri.</strong> Kayıt, giriş ve şifre sıfırlama Cloudflare Turnstile ile korunur.
          Kontrol tamamlanamazsa istek izin verilmek yerine reddedilir.
        </li>
      </ul>

      <h2 id="accounts">Hesaplar ve giriş</h2>
      <ul>
        <li>
          <strong>Şifreler</strong> hiçbir zaman saklanmaz; yalnızca tuzlanmış bir scrypt özeti (kasıtlı olarak yavaş ve bellek
          yoğun bir fonksiyon) saklanır. En az uzunluk 8 karakterdir. Özetler, kimseyi dışarıda bırakmadan sonradan
          güçlendirilebilir.
        </li>
        <li>
          <strong>E-posta doğrulaması</strong> panel açılmadan önce zorunludur. Kodlar altı haneli, 15 dakika geçerlidir,
          yalnızca özet olarak saklanır, 5 yanlış denemeden sonra kilitlenir ve bir saatte ne sıklıkla istenebileceği ve
          tahmin edilebileceği sınırlıdır.
        </li>
        <li>
          <strong>Kaba kuvvet koruması.</strong> Başarısız girişler e-posta, IP adresi ve ikisi birlikte olarak sayılır ve
          sonraki denemeleri 15 dakika kilitler. Bilinmeyen bir e-postanın reddi yanlış şifreyle aynı sürer ve hata mesajı
          aynıdır; böylece form hangi e-postaların hesabı olduğunu ele vermez.
        </li>
        <li>
          <strong>Oturumlar.</strong> Çerez rastgele 256 bitlik bir belirteç taşır; veritabanımız yalnızca onun SHA-256 özetini
          saklar, dolayısıyla bir veritabanı sızıntısı canlı oturumları vermez. Çerez HttpOnly (betikler okuyamaz), Secure
          (yalnızca HTTPS) ve SameSite=Lax'tır. Oturum 24 saat, "oturumumu açık tut" derseniz 30 gün sürer.
        </li>
        <li>
          <strong>Kontrol sizde.</strong> Şifrenizi değiştirmek veya sıfırlamak diğer tüm cihazlardaki oturumları kapatır.
          Ayarlar'dan diğer tüm cihazlardan da çıkış yapabilir ve kaç tanesinin açık olduğunu görebilirsiniz.
        </li>
        <li>
          <strong>Google ve GitHub ile giriş</strong> tek kullanımlık bir state değeri (Google için ayrıca PKCE) kullanır.
          Yalnızca sağlayıcının doğrulanmış dediği e-postayı kabul ederiz; böylece kimse sahibi olmadığı bir adresi sahiplenemez.
        </li>
        <li>
          <strong>Güvenlik kaydı.</strong> Girişler, başarısızlıklar, sıfırlamalar ve şifre değişiklikleri zaman, IP adresi ve
          tarayıcı bilgisiyle kaydedilir; böylece bir olay incelenebilir.
        </li>
        <li>
          <strong>Hesabınızı kendiniz silin</strong>; e-postanızı yazarak onaylarsınız. Yalnızca sizin üyesi olduğunuz çalışma
          alanları da silinir.
        </li>
      </ul>

      <h2 id="data">Verilerinizi koruma</h2>
      <ul>
        <li>
          <strong>Aktarımda şifreleme.</strong> Web sitesi, panel ve sohbet API'sine her bağlantı HTTPS kullanır; HSTS (iki yıl,
          alt alan adları dahil) tarayıcıların düz HTTP'ye dönmesini engeller. Veritabanı bağlantısı şifrelidir ve sohbet
          API'si veritabanının sertifikasını doğrular.
        </li>
        <li>
          <strong>Her çalışma alanı ayrıdır.</strong> Panel sorguları her zaman oturum açmış kullanıcının çalışma alanıyla
          sınırlıdır. Her veritabanı tablosunda, herkese açık politika olmadan satır düzeyinde güvenlik (RLS) açıktır; yani
          veritabanının herkese açık REST arayüzü hiçbir şeyi okuyamaz, yalnızca kendi kimlik bilgileriyle sunucularımız
          okuyabilir.
        </li>
        <li>
          <strong>Kodlar ve belirteçler özetlenir</strong>, okunabilir biçimde saklanmaz: oturum belirteçleri, doğrulama ve
          şifre sıfırlama kodları ve devir adresi doğrulama kodları.
        </li>
        <li>
          <strong>Kişisel veriler kayıtlara girmez.</strong> E-posta adresleri, telefon numaraları, kart numaraları (Luhn
          algoritmasıyla kontrol edilir) ile Türkiye, Litvanya, Letonya ve Estonya IBAN'ları, uygulama kayıtlarımıza yazılmadan önce maskelenir.
        </li>
        <li>
          <strong>Saklama süresi sizde.</strong> Konuşmalar, belirlediğiniz sürenin (1 ile 365 gün, varsayılan 30) sonunda otomatik
          silinir ve istediğinizi panelden kendiniz silebilirsiniz.
        </li>
        <li>
          <strong>Eğitim isteğe bağlıdır.</strong> İçeriğinizi kendi modellerimizi geliştirmek için yalnızca evet dediyseniz
          kullanırız ve bunu istediğiniz zaman değiştirebilirsiniz.
        </li>
        <li>
          <strong>Önemli olan yerde AB'de barındırılır.</strong> Sohbet API'si Frankfurt, Almanya'da çalışır. Verilere erişen tüm
          sağlayıcılar için <a href="/privacy#providers">Gizlilik Politikası</a>'na bakın.
        </li>
      </ul>

      <h2 id="crawler">Web sitenizi güvenle okuma</h2>
      <p>
        Apex'e bir URL verdiğinizde tarayıcımız bunu sizin adınıza çeker. URL'yi siz yazdığınız için onu güvenilmez girdi
        sayarız; böylece iç ağımıza ulaşmak için kullanılamaz:
      </p>
      <ul>
        <li>Yalnızca standart portlarda (80 ve 443) <code>http</code> ve <code>https</code>; içine kimlik bilgisi gömülü URL'ler kabul edilmez.</li>
        <li>
          Yalnızca herkese açık adresler. Özel, geri döngü (loopback), link-local ve ayrılmış aralıklar, IPv6 ve IPv4-eşlemeli
          biçimleri dahil engellenir ve kontrol gerçekten bağlanılan adreste yapılır; bu da DNS rebinding hilelerini boşa
          çıkarır. <code>localhost</code>, <code>.local</code> ve <code>.internal</code> gibi yerel ad alanları reddedilir.
        </li>
        <li>Her yönlendirme yeniden kontrol edilir, en fazla 5 adım. Süre ve boyut sınırlıdır; sıkıştırma açıldıktan sonra da, zip bombalarını durdurmak için.</li>
        <li>
          Kendini <code>ApexBot</code> olarak tanıtır ve sitenin <code>robots.txt</code> dosyasına uyar.
        </li>
      </ul>

      <h2 id="headers">Tarayıcı korumaları</h2>
      <p>Panel ve web sitesi her sayfada şu güvenlik başlıklarını gönderir:</p>
      <ul>
        <li><code>X-Frame-Options: DENY</code> ve <code>frame-ancestors 'none'</code>; panel clickjacking için çerçeve içine alınamaz.</li>
        <li>İki yıl süreli, alt alan adlarını da kapsayan <code>Strict-Transport-Security</code>.</li>
        <li><code>X-Content-Type-Options: nosniff</code> ve sıkı bir referrer politikası.</li>
        <li>İçerik güvenliği politikasında <code>object-src 'none'</code> ve <code>base-uri 'self'</code>.</li>
        <li>Kamera, mikrofon ve konumu kapatan bir izin politikası.</li>
      </ul>
      <p>
        API yalnızca JSON gövdeleri kabul eder; bir siteler arası form bunları ön kontrol olmadan gönderemez. Sunucuyu tanıtan
        bir başlık da yayınlanmaz.
      </p>

      <h2 id="development">Nasıl geliştiriyor ve işletiyoruz</h2>
      <ul>
        <li>Giriş, arama, hız sınırları, tarayıcı ve veri maskelemeyi yöneten kodun otomatik testleri vardır.</li>
        <li>Sırlar (API anahtarları, veritabanı kimlik bilgileri) kodda değil, barındırma sağlayıcılarının gizli depolarında durur.</li>
        <li>Veritabanı değişiklikleri sürümlü göçlerdir (migration); otomatik uygulanır ve güvenle yeniden çalıştırılabilir.</li>
        <li>Güvendiğimiz sağlayıcılar ve her birinin ne aldığı <a href="/privacy#providers">Gizlilik Politikası</a>'nda listelenir.</li>
      </ul>

      <h2 id="shared">Sizin yapabilecekleriniz</h2>
      <ul>
        <li>Yalnızca asistanın görünmesi gereken web sitelerini listeleyin ve alan adlarınız değiştiğinde listeyi gözden geçirin.</li>
        <li>Güçlü ve benzersiz bir şifre veya Google ya da GitHub girişi kullanın; artık kullanmadığınız cihazların oturumunu kapatın.</li>
        <li>Apex'e verdiğiniz sayfalara ve metinlere özel bilgi koymayın: orada olan her şeyin bir ziyaretçiye aktarılabileceğini varsayın.</li>
        <li>Sitenize uygun saklama süresini ve günlük bütçeyi belirleyin; kontrolünüzdeki bir devir adresi kullanın.</li>
        <li>KVKK ve GDPR'ın gerektirdiği gibi, ziyaretçilerinize verilerini nasıl işlediğinizi anlatın.</li>
      </ul>

      <h2 id="report">Güvenlik açığı veya olay bildirin</h2>
      <p>
        Bir zayıflık bulduğunuzu ya da hesabınızda bir şeylerin ters gittiğini düşünüyorsanız{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> adresine yazın; yeniden üretmemize yetecek ayrıntıyı ekleyin.
        Kamuya açıklamadan önce düzeltmemiz için makul bir süre tanımanızı, başkalarının verilerine erişmemenizi, hizmeti
        aksatmamanızı ve canlı ortama otomatik tarama yapmamanızı rica ederiz. Bildiriminizi onaylar ve sizi
        bilgilendirmeye devam ederiz.
      </p>
      <p>
        Hiçbir sistem kusursuz derecede güvenli değildir. Verilerinizi etkileyen bir ihlal olursa kanunun gerektirdiği şekilde
        size ve ilgili kurumlara bildiririz. Kişisel verileri nasıl işlediğimiz için{" "}
        <a href="/privacy">Gizlilik Politikası</a>'na bakın.
      </p>
    </>
  );
}

export const security: ProseContent = {
  eyebrow: "Güven",
  title: "Güvenlik",
  intro: "Apex; hesabınızı, ziyaretçilerinizin konuşmalarını ve web sitenizi nasıl koruyor. Varsayılan olarak nelerin açık olduğu, sade bir dille.",
  toc: [
    { id: "overview", label: "Kısaca" },
    { id: "widget", label: "Web sitesi ve widget" },
    { id: "ai", label: "Yapay zekâ güvenliği" },
    { id: "abuse", label: "Kötüye kullanım ve maliyet" },
    { id: "accounts", label: "Hesaplar ve giriş" },
    { id: "data", label: "Verilerinizi koruma" },
    { id: "crawler", label: "Web sitenizi okuma" },
    { id: "headers", label: "Tarayıcı korumaları" },
    { id: "development", label: "Nasıl geliştiriyoruz" },
    { id: "shared", label: "Sizin yapabilecekleriniz" },
    { id: "report", label: "Açık bildirin" },
  ],
  body: Body,
};
