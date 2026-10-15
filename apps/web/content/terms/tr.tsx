import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { localizePath } from "@/lib/i18n";
import type { ProseContent } from "../types";

function Body() {
  return (
    <>
      <h2>1. Hizmet</h2>
      <p>
        Apex Bot (“Apex”, “biz”), sağladığınız içeriği kullanarak web sitenizin ziyaretçilerinin sorularını yanıtlayan bir
        yapay zekâ asistanı ve bunu yapılandırmanız için bir yönetim paneli sunar. Apex şu anda beta aşamasındadır: özellikler
        değişebilir ve hizmeti geliştirirken erişimi sınırlayabilir veya geçici olarak durdurabiliriz.
      </p>

      <h2>2. Hesabınız</h2>
      <ul>
        <li>Kayıt olurken doğru bilgi vermeli ve şifrenizi güvende tutmalısınız.</li>
        <li>Davet ettiğiniz ekip arkadaşlarınızınkiler de dahil olmak üzere çalışma alanınızdaki işlemlerden siz sorumlusunuz.</li>
        <li>
          Bulunduğunuz yerde bağlayıcı bir sözleşme yapabilecek yaşta olmalı ve işletme olarak kaydoluyorsanız o işletme adına
          hareket etmelisiniz.
        </li>
      </ul>

      <h2>3. İçeriğiniz ve web siteniz</h2>
      <p>
        Apex'e verdiğiniz içerik (web sayfaları, metinler, ayarlar) ve web sitenizdeki konuşmalar üzerindeki tüm haklar size
        aittir. Bize bunları yalnızca hizmeti sizin için çalıştırmak amacıyla saklama ve işleme izni verirsiniz. Bu içeriği
        kullanma hakkınız olduğunu ve Apex'in yönlendirdiğiniz web sitelerini okuyabileceğini onaylarsınız.
      </p>

      <h2>4. Yapay zekâ tarafından üretilen yanıtlar</h2>
      <p>
        Yanıtlar, içeriğinizden yararlanılarak üçüncü taraf yapay zekâ modelleri tarafından üretilir. Eksik veya hatalı
        olabilirler. Apex, ziyaretçilere bir yapay zekâyla konuştuklarını gösterir; web sitenizdeki bilgilerden ve bunlara
        dayanarak verilen kararlardan siz sorumlu olmaya devam edersiniz. Tıbbi, hukuki veya finansal tavsiye için asistana
        güvenmeyin.
      </p>

      <h2>5. Kabul edilebilir kullanım</h2>
      <p>Apex'i aşağıdaki amaçlarla kullanmamayı kabul edersiniz:</p>
      <ul>
        <li>kanunu çiğnemek, başkalarının haklarını ihlal etmek veya ziyaretçileri kiminle konuştukları konusunda yanıltmak;</li>
        <li>hukuki bir dayanak ve KVKK, GDPR ya da benzeri kanunların gerektirdiği aydınlatmalar olmadan hassas kişisel veri toplamak;</li>
        <li>hizmete saldırmak, aşırı yük bindirmek, tersine mühendislik yapmak veya kullanım limitlerini ya da güvenlik kontrollerini aşmak.</li>
      </ul>

      <h2>6. Gizlilik</h2>
      <p>
        <a href={localizePath("/privacy", "tr")}>Gizlilik Politikamız</a>, kişisel verileri nasıl işlediğimizi açıklar.
        Ziyaretçileriniz asistanınızla sohbet ettiğinde, onların verileri bakımından veri sorumlusu siz olursunuz; biz bu
        verileri sizin adınıza işleriz.
      </p>

      <h2>7. Ücretler</h2>
      <p>
        Apex beta süresince ücretsizdir. Ücretli planlar başlamadan önce size önceden haber veririz ve devam edip etmeyeceğinize
        siz karar verirsiniz.
      </p>

      <h2>8. Kullanımın sona ermesi</h2>
      <p>
        Widget'ı sitenizden kaldırıp hesabınızın silinmesini talep ederek Apex'i istediğiniz zaman kullanmayı bırakabilirsiniz.
        Bu koşulları ihlal eden ya da hizmeti veya diğer müşterileri riske atan hesapları askıya alabiliriz.
      </p>

      <h2>9. Sorumluluk</h2>
      <p>
        Hizmet, beta süresince “olduğu gibi” sunulur. Kanunun izin verdiği ölçüde dolaylı veya sonuç olarak ortaya çıkan
        zararlardan sorumlu değiliz ve toplam sorumluluğumuz, talepten önceki on iki ayda bize ödediğiniz tutarla sınırlıdır.
      </p>

      <h2>10. Değişiklikler ve iletişim</h2>
      <p>
        Bu koşulları güncelleyebiliriz; önemli değişiklikleri yürürlüğe girmeden önce size bildiririz. Sorularınız için:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

export const terms: ProseContent = {
  eyebrow: "Yasal",
  title: "Kullanım Koşulları",
  intro: `Sürüm ${TERMS_VERSION}. Bu koşullar, yönetim paneli ve web sitenize yüklediğiniz sohbet widget'ı dahil olmak üzere Apex Bot'u kullanımınız için geçerlidir.`,
  body: Body,
};
