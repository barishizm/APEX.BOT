import { CONTACT_EMAIL } from "@/components/site-nav";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2>Kimleri kapsar</h2>
      <ul>
        <li>
          <strong>Müşteriler</strong>: Apex hesabı oluşturup bir asistan kuran kişiler. Hesap verileriniz bakımından veri
          sorumlusu biziz.
        </li>
        <li>
          <strong>Ziyaretçiler</strong>: bir müşterinin web sitesindeki asistanla sohbet eden kişiler. Bu verilerin veri
          sorumlusu müşteridir; ziyaretçi verilerini müşteri adına veri işleyen olarak işleriz.
        </li>
      </ul>

      <h2>Hangi verileri topluyoruz</h2>
      <table>
        <thead>
          <tr>
            <th>Veri</th>
            <th>Amaç</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ad, kullanıcı adı, e-posta, şirket ve şifre (yalnızca güvenli bir özet/hash olarak saklanır)</td>
            <td>Hesabınızı oluşturmak ve korumak</td>
          </tr>
          <tr>
            <td>Giriş kayıtları: zaman, IP adresi ve tarayıcı</td>
            <td>Hesapları kötüye kullanıma ve yetkisiz erişime karşı korumak</td>
          </tr>
          <tr>
            <td>Asistanınızın ayarları ve öğrendiği içerik</td>
            <td>Ziyaretçilerinizi yanıtlamak</td>
          </tr>
          <tr>
            <td>Konuşmalar, geri bildirimler ve ziyaretçilerin paylaşmayı seçtiği iletişim bilgileri</td>
            <td>Konuşmayı göstermek, devir taleplerini ve potansiyel müşterileri müşteriye iletmek ve yanıtları iyileştirmek</td>
          </tr>
        </tbody>
      </table>
      <p>Kişisel verileri satmayız ve reklam amacıyla kullanmayız.</p>

      <h2>Yapay zekâ sağlayıcıları</h2>
      <p>
        Bir yanıt üretmek için ziyaretçinin mesajı ve müşteri içeriğinin ilgili bölümleri, müşterinin seçtiği yapay zekâ
        sağlayıcısına (Anthropic, OpenAI veya Google) gönderilir. Sağlayıcılar bu veriyi, yanıtı döndürmek amacıyla kendi API
        koşulları çerçevesinde işler.
      </p>

      <h2>Model eğitimi</h2>
      <p>
        Bir müşterinin asistanlarını ve konuşmalarını kendi modellerimizi geliştirmek için yalnızca müşteri kayıt sırasında buna
        izin verdiyse kullanırız. Bu tercih, bizimle iletişime geçilerek her zaman değiştirilebilir.
      </p>

      <h2>Verileri ne kadar süre saklıyoruz</h2>
      <ul>
        <li>Konuşmalar: müşterinin belirlediği saklama süresinin sonunda otomatik olarak silinir (varsayılan 30 gün).</li>
        <li>Hesap verileri: hesap var olduğu sürece saklanır; ardından kanunen saklamamız gerekmedikçe silinir.</li>
        <li>
          Güvenlik kayıtları: kötüye kullanımı incelemek için sınırlı bir süre saklanır. E-posta adresleri, telefon ve kart
          numaraları bu kayıtlarda maskelenir.
        </li>
      </ul>

      <h2>Çerezler</h2>
      <p>
        Panel, oturumunuzu açık tutmak için zorunlu bir oturum çerezi ve oturum durumunu sayfalarda göstermek için buna bağlı
        küçük bir yardımcı çerez kullanır; dil seçiminizi yaparsanız tercihiniz bir çerezde hatırlanır. Sohbet widget'ı çerez
        kullanmaz; müşterinin ayarlarına bağlı olarak mevcut konuşmayı ziyaretçinin tarayıcı deposunda tutabilir.
      </p>

      <h2>Haklarınız</h2>
      <p>
        Kişisel verilerinize erişmeyi, bunları düzeltmeyi, dışa aktarmayı veya silmeyi talep edebilir ya da nasıl
        kullandığımıza itiraz edebilirsiniz (KVKK madde 11 ve GDPR). Ziyaretçiler önce sohbet ettikleri web sitesiyle iletişime
        geçmelidir; o müşterinin yanıt vermesine yardımcı oluruz. <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
        adresine yazın, 30 gün içinde yanıt verelim. Ayrıca veri koruma otoritesine (Türkiye'de Kişisel Verileri Koruma
        Kurumu) şikâyette bulunabilirsiniz.
      </p>

      <h2>Güvenlik</h2>
      <p>
        Veriler aktarım sırasında şifrelenir, erişim çalışma alanı bazında kısıtlanır ve şifreler scrypt ile özetlenir (hash).
        Hiçbir sistem kusursuz derecede güvenli değildir; sizi etkileyen bir ihlal olursa kanunun gerektirdiği şekilde size
        bildiririz.
      </p>
    </>
  );
}

export const privacy: ProseContent = {
  eyebrow: "Yasal",
  title: "Gizlilik Politikası",
  intro: "Neleri, neden topladığımız ve sahip olduğunuz seçenekler. KVKK (Türkiye) ve GDPR (AB) gerekliliklerini karşılayacak şekilde yazılmıştır.",
  body: Body,
};
