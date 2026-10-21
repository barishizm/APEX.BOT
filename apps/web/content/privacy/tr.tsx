import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2 id="who">Kimleri kapsar</h2>
      <ul>
        <li>
          <strong>Müşteriler</strong>: Apex hesabı oluşturup bir asistan kuran kişiler ve bekleme listemize yazılanlar. Hesap
          verileriniz bakımından veri sorumlusu biziz.
        </li>
        <li>
          <strong>Ziyaretçiler</strong>: bir müşterinin web sitesindeki asistanla sohbet eden kişiler. Bu verilerin veri
          sorumlusu müşteridir; ziyaretçi verilerini müşteri adına ve yalnızca onun talimatlarıyla veri işleyen olarak işleriz.
        </li>
      </ul>
      <p>
        Bu politika, Apex Bot'un bugün nasıl çalıştığını anlatır. Verileri nasıl koruduğumuz <a href="/security">Güvenlik</a>{" "}
        sayfasında daha ayrıntılı açıklanır.
      </p>

      <h2 id="collect">Hangi verileri topluyoruz</h2>
      <h3>Müşterilerden</h3>
      <table>
        <thead>
          <tr>
            <th>Veri</th>
            <th>Amaç</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ad, kullanıcı adı, e-posta, hesap türü, şirket adı ve büyüklüğü (kurumsal hesaplar)</td>
            <td>Hesabınızı ve çalışma alanınızı oluşturmak ve işletmek</td>
          </tr>
          <tr>
            <td>
              Şifre; yalnızca tuzlanmış scrypt özeti (hash) olarak saklanır. Google veya GitHub ile giren hesapların, siz
              belirlemedikçe şifresi yoktur
            </td>
            <td>Giriş yapmanızı sağlamak</td>
          </tr>
          <tr>
            <td>
              Google veya GitHub ile giriş yaparsanız: sağlayıcıdaki hesap kimliği, doğrulanmış e-postanız ve adınız. Google
              veya GitHub şifrenizi hiçbir zaman görmeyiz ve hesabınızda hiçbir şey paylaşmayız
            </td>
            <td>Giriş yapmanızı sağlamak ve sağlayıcıyı hesabınıza bağlamak</td>
          </tr>
          <tr>
            <td>Koşulları ne zaman, hangi sürümüyle kabul ettiğiniz ve model eğitimi tercihiniz</td>
            <td>Onayınızın kaydını tutmak</td>
          </tr>
          <tr>
            <td>
              Güvenlik kaydı: girişler, başarısız girişler, doğrulama ve şifre sıfırlama talepleri, şifre değişiklikleri, diğer
              cihazlardaki oturumların kapatılması ve hesap silme; her biri zaman, IP adresi ve tarayıcı bilgisiyle
            </td>
            <td>Hesapları korumak, tahmin yoluyla girişi ve kötüye kullanımı sınırlamak, olayları incelemek</td>
          </tr>
          <tr>
            <td>Açık oturumlar: IP adresi, tarayıcı ve her oturumun son kullanım zamanı</td>
            <td>Oturumunuzu açık tutmak ve diğer cihazlardaki oturumları kapatmanıza izin vermek</td>
          </tr>
          <tr>
            <td>Asistanınızın ayarları, izin verdiğiniz web siteleri, Apex'in web sitenizden okuduğu sayfalar ve eklediğiniz metinler</td>
            <td>Ziyaretçilerinizi yanıtlamak</td>
          </tr>
          <tr>
            <td>Belirlediğiniz devir e-posta adresi ve ona gönderdiğimiz doğrulama kodu</td>
            <td>Adrese e-posta göndermeden önce size ait olduğunu doğrulamak</td>
          </tr>
          <tr>
            <td>Her asistanın günlük kullandığı yapay zekâ jetonu (token) sayısı</td>
            <td>Belirlediğiniz günlük bütçeyi uygulamak ve maliyeti öngörülebilir tutmak</td>
          </tr>
          <tr>
            <td>Bekleme listesine yazılırsanız e-posta adresiniz (ve sayfanın dili)</td>
            <td>Kayıtlar açıldığında size bir kez haber vermek. Başka hiçbir amaçla kullanmayız</td>
          </tr>
          <tr>
            <td>Faturalandırma: çalışma alanının planı, abonelik durumu ve yenileme tarihleri, Paddle müşteri ve abonelik kimlikleri, Paddle'ın kestiği faturalar ve çalışma alanı başına aylık yapay zekâ yanıtı sayısı. Kart ve diğer ödeme bilgileri Paddle'a girilir; bunları hiçbir zaman görmez ve saklamayız</td>
            <td>Ödediğiniz planı uygulamak, açtığınız ek yanıtları faturalandırmak, faturaları göstermek ve faturalandırma e-postaları göndermek</td>
          </tr>
        </tbody>
      </table>

      <h3>Bir müşterinin web sitesindeki ziyaretçilerden</h3>
      <table>
        <thead>
          <tr>
            <th>Veri</th>
            <th>Amaç</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ziyaretçinin yazdığı mesajlar ve asistanın yanıtları, her yanıtın altında gösterilen kaynak sayfalarla birlikte</td>
            <td>Konuşmayı sürdürmek ve müşteriye göstermek</td>
          </tr>
          <tr>
            <td>Bir yanıta verilen beğen / beğenme</td>
            <td>Müşteriye hangi yanıtların geliştirilmesi gerektiğini göstermek</td>
          </tr>
          <tr>
            <td>Sohbetin gerçekleştiği web sitesi adresi</td>
            <td>İzin verilen siteler listesini uygulamak ve konuşmaları gruplamak</td>
          </tr>
          <tr>
            <td>Ad, e-posta ve telefon; yalnızca ziyaretçi kendisi yazmayı seçerse (devir talebi veya müşterinin potansiyel müşteri formu)</td>
            <td>Talebi veya potansiyel müşteriyi e-postayla müşteriye iletmek ve panelinde göstermek</td>
          </tr>
          <tr>
            <td>Ziyaretçinin IP adresi; kısa süre bellekte tutulur</td>
            <td>Ziyaretçi başına mesaj hızını sınırlamak. Konuşmayla birlikte kaydedilmez</td>
          </tr>
        </tbody>
      </table>
      <p>
        Kişisel verileri satmayız, reklam amacıyla kullanmayız ve reklam profili oluşturmayız. Ziyaretçilerden hesap
        oluşturmaları istenmez ve widget yapay zekâ ile konuştuklarını bildirir. Ziyaretçilerden sohbet üzerinden hassas bilgi
        (sağlık, ödeme kartı, kimlik numarası) istenmemelidir; biri yine de yazarsa diğer mesajlar gibi işlenir; kart, telefon,
        e-posta ve IBAN kalıpları kayıtlarımızdan maskelenir.
      </p>

      <h2 id="use">Verileri nasıl kullanıyoruz</h2>
      <ul>
        <li>Hizmeti sunmak için: giriş yaptırmak, ziyaretçileri yanıtlamak, devir taleplerini ve potansiyel müşterileri iletmek, konuşmaları göstermek.</li>
        <li>Hizmeti güvende tutmak için: hız sınırları, bot kontrolleri, kötüye kullanım tespiti ve olay incelemesi.</li>
        <li>Size e-posta göndermek için: doğrulama ve şifre sıfırlama kodları, devir ve potansiyel müşteri bildirimleri, güvenlik bildirimleri.</li>
        <li>Ücretli planları faturalandırmak için: planı uygulamak, yapay zekâ yanıtlarını plana göre saymak, açtığınız ek yanıtları ücretlendirmek ve sahiplere ödemeler, yenilemeler, beta planının sona ermesi ve kullanım hakkında e-posta göndermek.</li>
        <li>Kendi modellerimizi geliştirmek için, yalnızca siz izin verdiyseniz (aşağıya bakın).</li>
        <li>Yasal yükümlülüklerimizi yerine getirmek için.</li>
      </ul>
      <p>
        Hukuki sebepler (GDPR) ve işleme şartları (KVKK): sizinle aramızdaki sözleşmenin ifası; güvenlik ve kötüye kullanımı
        önlemedeki meşru menfaatimiz; istediğimiz yerlerde açık rızanız (model eğitimi, bekleme listesi) ve hukuki
        yükümlülükler. Ziyaretçi verilerinde amacı ve hukuki sebebi müşteri belirler.
      </p>

      <h2 id="providers">Verilere başka kimler erişiyor</h2>
      <p>
        Her biri yalnızca belirtilen iş için kullandığımız az sayıda hizmet sağlayıcıyla (alt işleyen) çalışırız. Onlara o
        işin gerektirdiğinden fazlasını vermeyiz.
      </p>
      <table>
        <thead>
          <tr>
            <th>Sağlayıcı</th>
            <th>Ne için</th>
            <th>İlgili veri</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Anthropic, OpenAI veya Google (müşterinin o asistan için seçtiği)</td>
            <td>Yanıt üretmek</td>
            <td>Ziyaretçinin mesajı, konuşmanın son mesajları ve müşteri içeriğinin ilgili bölümleri</td>
          </tr>
          <tr>
            <td>Google (Gemini API)</td>
            <td>Arama: asistanın doğru sayfaları bulması için müşteri içeriğini ve ziyaretçi sorularını vektöre çevirmek</td>
            <td>Müşterinin sayfalarının ve eklediği içeriğin metni ile ziyaretçinin mesajı (devam sorularında bir önceki mesajla birlikte). Ortaya çıkan vektörleri kendi veritabanımızda saklarız. Google'ın ücretsiz katmanını kullandığımız sürece Google'ın koşulları bu verileri kendi ürünlerini geliştirmek için kullanmasına izin verir</td>
          </tr>
          <tr>
            <td>Supabase (yönetilen PostgreSQL)</td>
            <td>Veritabanı</td>
            <td>Sakladığımız her şey: hesaplar, ayarlar, bilgi tabanı, konuşmalar</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Web sitesi ve panelin barındırılması</td>
            <td>IP adresleri dahil, web sitesine gelen istekler</td>
          </tr>
          <tr>
            <td>Render (Frankfurt, Almanya)</td>
            <td>Widget'ın konuştuğu sohbet API'sinin barındırılması</td>
            <td>Sohbet istekleri ve süren konuşma</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>E-posta göndermek</td>
            <td>Alıcı adresi ve mesaj içeriği (kodlar, devir talepleri, potansiyel müşteriler)</td>
          </tr>
          <tr>
            <td>Cloudflare Turnstile</td>
            <td>Kayıt, giriş, şifre sıfırlama ve bekleme listesinde insan / bot ayrımı</td>
            <td>Bir doğrulama belirteci, IP adresiniz ve kontrolün çalışması için gereken tarayıcı sinyalleri</td>
          </tr>
          <tr>
            <td>Google ve GitHub</td>
            <td>"ile giriş yap" düğmeleri, yalnızca kullanırsanız</td>
            <td>Sağlayıcının geri gönderdikleri (yukarıya bakın)</td>
          </tr>
          <tr>
            <td>Paddle (Paddle.com Market Ltd, Birleşik Krallık)</td>
            <td>Ücretli planların satıcısı (Merchant of Record): ödeme sayfası, tahsilat, faturalar, vergi, iadeler ve dolandırıcılık kontrolleri</td>
            <td>Ad, e-posta adresi, fatura ülkesi ve adresi, verirseniz KDV numarası, ödeme bilgileri (yalnızca Paddle'da tutulur), satın alınan ürün ve çalışma alanının kimliği. Satıcı olduğu için Paddle, ödeme sırasında topladığı veriler bakımından kendi <a href="https://www.paddle.com/legal/privacy">gizlilik bildirimi</a> kapsamında bağımsız veri sorumlusudur</td>
          </tr>
        </tbody>
      </table>
      <p>
        Yapay zekâ sağlayıcıları, yanıtı döndürmek için veriyi kendi API koşulları çerçevesinde işler. Bazı sağlayıcılar
        Türkiye ve AB/AEA dışında bulunduğundan veriler yurt dışına aktarılabilir; gerektiğinde kanunun öngördüğü güvencelere,
        örneğin standart sözleşme hükümlerine ve sağlayıcının kendi taahhütlerine dayanırız. Bir mahkeme veya yetkili makam
        hukuken talep ederse verileri paylaşabiliriz.
      </p>

      <h2 id="training">Model eğitimi</h2>
      <p>
        Bir müşterinin asistanlarını ve konuşmalarını kendi modellerimizi geliştirmek için yalnızca müşteri kayıt sırasında buna
        izin verdiyse kullanırız. Varsayılan "hayır"dır. Bu tercihi panelde Ayarlar'dan ya da bizimle iletişime geçerek her
        zaman değiştirebilirsiniz; değişiklik bundan sonraki verileri etkiler.
      </p>

      <h2 id="retention">Verileri ne kadar süre saklıyoruz</h2>
      <table>
        <thead>
          <tr>
            <th>Veri</th>
            <th>Süre</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Konuşmalar ve içlerindeki iletişim bilgileri</td>
            <td>
              Müşterinin belirlediği saklama süresi boyunca (1 ile 365 gün arası, varsayılan 30) hareketsiz kaldıktan sonra
              otomatik silinir. Müşteri istediği konuşmayı panelinden daha erken silebilir; ziyaretçi de müşteriden sohbetinin
              silinmesini isteyebilir
            </td>
          </tr>
          <tr>
            <td>Oturumlar</td>
            <td>Tarayıcı oturumu için 24 saat, "oturumumu açık tut" ile 30 gün. Çıkış yapmak, şifreyi değiştirmek veya sıfırlamak oturumları erken bitirir</td>
          </tr>
          <tr>
            <td>Doğrulama ve sıfırlama kodları</td>
            <td>15 dakika geçerlidir; yalnızca özet (hash) olarak saklanır</td>
          </tr>
          <tr>
            <td>Hesap verileri, ayarlar ve bilgi tabanı</td>
            <td>Hesap var olduğu sürece. Hesabı sildiğinizde bunlar da silinir; yasanın saklamamızı gerektirdiği şeyler hariç</td>
          </tr>
          <tr>
            <td>Güvenlik kaydı</td>
            <td>
              Kötüye kullanımı ve olayları inceleyebilmek için saklanır. Hesabınızı sildiğinizde kayıtlar hesabınızla
              ilişkisi kesilerek tutulur; e-posta veya IP adresi içerenlerin silinmesini bizden isteyebilirsiniz (yasanın
              gerektirdiklerini saklayabiliriz)
            </td>
          </tr>
          <tr>
            <td>Bekleme listesi e-postası</td>
            <td>Kayıtlar açılıp size haber verene kadar veya kaldırmamızı isteyene kadar</td>
          </tr>
          <tr>
            <td>Günlük jeton sayıları</td>
            <td>Ait oldukları asistanla birlikte</td>
          </tr>
          <tr>
            <td>Uygulama kayıtları (log)</td>
            <td>Sınırlı bir süre; e-posta, telefon, kart numarası ve IBAN yazılmadan önce maskelenir</td>
          </tr>
          <tr>
            <td>Faturalandırma kayıtları (abonelikler, faturalar, tahsilatlar)</td>
            <td>Vergi ve muhasebe mevzuatının gerektirdiği süre boyunca; bu süre hesap silindikten sonrasını da kapsayabilir. Aylık yapay zekâ yanıtı sayıları çalışma alanıyla birlikte tutulur</td>
          </tr>
        </tbody>
      </table>
      <p>
        Sağlayıcılarımızdaki veriler, biz sildikten sonra yedeklerinde kısa bir süre daha kalabilir ve yedekler döndükçe
        kaldırılır.
      </p>

      <h2 id="cookies">Çerezler ve tarayıcı depolaması</h2>
      <table>
        <thead>
          <tr>
            <th>Ad</th>
            <th>Ne yapar</th>
            <th>Süre</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>apex_session</td>
            <td>Oturumunuzu açık tutar. Zorunludur; HttpOnly olduğundan sayfa betikleri okuyamaz</td>
            <td>Tarayıcı oturumu veya "oturumumu açık tut" dediyseniz 30 gün</td>
          </tr>
          <tr>
            <td>apex_signed_in</td>
            <td>Herkese açık sayfalarımızın "Giriş yap" yerine "Panel" göstermesini sağlayan zararsız bir işaret. Kişisel veri içermez</td>
            <td>Oturumla aynı</td>
          </tr>
          <tr>
            <td>Dil çerezi</td>
            <td>Seçtiğiniz dili hatırlar</td>
            <td>1 yıl</td>
          </tr>
          <tr>
            <td>apex_oauth</td>
            <td>Devam eden bir Google veya GitHub girişini korur. Tek kullanımlık</td>
            <td>10 dakika</td>
          </tr>
        </tbody>
      </table>
      <p>
        Reklam veya analiz çerezi kullanmayız. Sohbet widget'ı çerez kullanmaz; müşterinin ayarına göre yalnızca mevcut
        konuşmanın kimliğini ziyaretçinin tarayıcısında tutar (sekme için, tarayıcı için ya da hiç). Cloudflare Turnstile
        çalışırken işini yapmak için kendi depolamasını kullanabilir.
      </p>

      <h2 id="rights">Haklarınız</h2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenmeyi, bunlara erişmeyi, düzeltmeyi, dışa aktarmayı, silmeyi, işlemenin
        kısıtlanmasını veya buna itirazı talep edebilir ya da rızanızı geri çekebilirsiniz (KVKK madde 11 ve GDPR).
      </p>
      <ul>
        <li>
          <strong>Hesabınızı kendiniz silin</strong>: panelde Ayarlar'dan. Hesabınızı ve tek üyesi olduğunuz çalışma alanını;
          asistanları, bilgi tabanı ve konuşmalarıyla birlikte siler.
        </li>
        <li>
          <strong>Oturumlarınızı yönetin</strong>: Ayarlar'dan şifrenizi değiştirin ve diğer tüm cihazlardaki oturumları kapatın.
        </li>
        <li>
          <strong>Ziyaretçiler</strong> konuşmalarını görmek veya sildirmek için sohbet ettikleri web sitesiyle iletişime
          geçmelidir; o müşterinin yanıt vermesine yardımcı oluruz.
        </li>
        <li>
          Diğer her şey için, verilerinizin bir kopyası dahil, <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
          adresine yazın. 30 gün içinde yanıt veririz. İşlem yapmadan önce size ait olduğunu doğrulamamız gerekebilir.
        </li>
      </ul>
      <p>
        Ayrıca veri koruma otoritesine (Türkiye'de Kişisel Verileri Koruma Kurumu; AB'de ülkenizdeki otorite) şikâyette
        bulunabilirsiniz.
      </p>

      <h2 id="customers">Müşteriyseniz: sorumluluklarınız</h2>
      <p>
        Ziyaretçilerinizin verilerinin veri sorumlusu sizsiniz. Yani asistanın neyi topladığına siz karar verirsiniz, bunun
        için bir hukuki sebebinizin olması gerekir ve ziyaretçilerinize KVKK, GDPR veya benzeri yasaların gerektirdiği
        aydınlatmayı yapmalısınız (widget, kendi politikanıza bağlantı veren bir uyarı satırı gösterebilir). Onlara
        söylediğinizle uyumlu bir saklama süresi seçin. Bir ziyaretçinin verisi hakkında bize başvurulursa onu size
        yönlendirir ve yanıtlamanıza yardımcı oluruz. <a href="/terms">Kullanım Koşulları</a> da bunu kapsar.
      </p>

      <h2 id="security">Güvenlik</h2>
      <p>
        Veriler aktarım sırasında şifrelenir, erişim çalışma alanı bazında kısıtlanır, şifreler scrypt ile özetlenir (hash) ve
        asistan yalnızca izin verdiğiniz web sitelerinde yanıt verir. <a href="/security">Güvenlik sayfası</a> bunları
        ayrıntılı anlatır. Hiçbir sistem kusursuz derecede güvenli değildir; sizi etkileyen bir ihlal olursa kanunun
        gerektirdiği şekilde size ve ilgili kurumlara bildiririz.
      </p>

      <h2 id="children">Çocuklar</h2>
      <p>
        Apex işletmeler ve yetişkinler içindir. Hesap işletmek için 16 yaşından küçük çocuklardan bilerek veri toplamayız. Bir
        çocuğun bize veri verdiğini düşünüyorsanız bizimle iletişime geçin, sileriz.
      </p>

      <h2 id="changes">Değişiklikler ve iletişim</h2>
      <p>
        Ürün değiştikçe bu sayfayı güncelleriz ve önemli değişiklikleri yürürlüğe girmeden önce hesap sahiplerine bildiririz.
        Son değişikliğin sürümü en üstte yer alır. Sorular ve talepler: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Yasal",
  title: "Gizlilik Politikası",
  intro: `Sürüm ${TERMS_VERSION}. Neleri, neden topladığımız, verilere başka kimlerin eriştiği, ne kadar sakladığımız ve sahip olduğunuz seçenekler. KVKK (Türkiye) ve GDPR (AB) gerekliliklerini karşılayacak şekilde yazılmıştır.`,
  toc: [
    { id: "who", label: "Kimleri kapsar" },
    { id: "collect", label: "Hangi verileri topluyoruz" },
    { id: "use", label: "Verileri nasıl kullanıyoruz" },
    { id: "providers", label: "Verilere kimler erişiyor" },
    { id: "training", label: "Model eğitimi" },
    { id: "retention", label: "Saklama süreleri" },
    { id: "cookies", label: "Çerezler ve depolama" },
    { id: "rights", label: "Haklarınız" },
    { id: "customers", label: "Müşteriyseniz" },
    { id: "security", label: "Güvenlik" },
    { id: "children", label: "Çocuklar" },
    { id: "changes", label: "Değişiklikler ve iletişim" },
  ],
  body: Body,
};
