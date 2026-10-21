import { TERMS_VERSION } from "@apex/db";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { localizePath } from "@/lib/i18n";
import { billingTerms } from "../legal";
import type { ProseContent } from "../types";

const PRICING = localizePath("/pricing", "tr");
const PADDLE_TERMS = "https://www.paddle.com/legal/checkout-buyer-terms";

function Body() {
  const n = billingTerms("tr");
  return (
    <>
      <h2>1. Hizmet</h2>
      <p>
        Apex Bot (“Apex”, “biz”), sağladığınız içeriği kullanarak web sitenizin ziyaretçilerinin sorularını yanıtlayan bir
        yapay zekâ asistanı ve bunu yapılandırmanız için bir yönetim paneli sunar. Hizmeti geliştirirken özellikler değişebilir;
        Apex beta aşamasındayken erişimi sınırlayabilir veya geçici olarak durdurabiliriz.
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

      <h2>7. Planlar ve ücretler</h2>
      <p>
        Apex'in ücretsiz bir planı ve <a href={PRICING}>fiyatlandırma sayfasında</a> yapay zekâ yanıtları, web siteleri ve
        özellikleri listelenen ücretli planları (Starter, Pro ve Business) vardır. Ücretli planlar aylık veya yıllık olarak,
        ABD doları cinsinden peşin faturalandırılır.
      </p>
      <p>
        Apex beta süresince ücretsizdir. Ücretli planlar, en az {n.noticeDays} gün önceden e-postayla duyurduğumuz bir lansman
        tarihinde başlar. Lansmanda her beta çalışma alanı, son kullanımını karşılayan ücretli planı {n.betaDays} gün boyunca
        kart gerekmeden ücretsiz alır; bu süre bitmeden abone olmazsanız ardından ücretsiz plana geçer. Daha küçük bir plana
        geçmek hiçbir şeyi silmez: sınırı aşan web siteleri duraklatılır, planın üzerindeki özellikler ise yeniden yükseltene
        kadar uygulanmaz.
      </p>

      <h2>8. Paddle üzerinden ödeme</h2>
      <p>
        Sipariş sürecimiz çevrim içi satıcımız Paddle.com tarafından yürütülür. Paddle.com, tüm siparişlerimizin satıcısıdır
        (Merchant of Record): aboneliği size Paddle satar, ödemeyi alır, faturayı keser ve faturalandırma sorularını ve
        iadeleri kendi <a href={PADDLE_TERMS}>Alıcı Koşulları</a> kapsamında yürütür. Kart veya diğer ödeme bilgileriniz bize
        değil Paddle'a gider. Apex'in kullanımı ise bu koşullara tabi olmaya devam eder.
      </p>

      <h2>9. Vergiler</h2>
      <p>
        Fiyatlandırma sayfasındaki fiyatlara vergi dahil değildir. Satıcı olarak Paddle, bulunduğunuz yerde geçerli KDV, satış
        vergisi veya GST'yi hesaplar, ödeme sırasında ekler ve vergi dairelerine öder. Bir işletme adına satın alıp geçerli bir
        KDV numarası verirseniz bunun yerine sorumlu sıfatıyla beyan (reverse charge) uygulanabilir. Alınan vergi Paddle'ın
        faturasında gösterilir.
      </p>

      <h2>10. Yenileme, değişiklik ve iptal</h2>
      <ul>
        <li>
          Abonelik, siz iptal edene kadar her aylık veya yıllık dönemin sonunda otomatik olarak yenilenir ve Paddle kayıtlı
          ödeme yönteminden tahsil eder.
        </li>
        <li>
          Yükseltmeler hemen uygulanır ve dönemin kalanı için aradaki farkı ödersiniz. Düşürmeler, ödediğiniz dönemin sonunda
          uygulanır. Yıllıktan aylık faturalandırmaya geçiş hemen uygulanır; kullanılmayan süre Paddle bakiyenize alacak olarak
          eklenir.
        </li>
        <li>
          Panelde Ayarlar → Faturalandırma bölümünden istediğiniz zaman iptal edebilirsiniz. Plan, ödediğiniz dönemin sonuna
          kadar devam eder ve yenilenmez; sonrasında çalışma alanı ücretsiz plandadır.
        </li>
        <li>
          Bir ödeme alınamazsa, ödeme yeniden denenirken çalışma alanı planını {n.graceDays} gün korur. Ödeme yine de
          alınamazsa çalışma alanı ücretsiz plana geçer.
        </li>
        <li>
          Bir fiyat değişikliği aboneliğinize yansımadan en az {n.noticeDays} gün önce size bildiririz. Değişiklik bundan
          sonraki ilk yenilemenizden itibaren uygulanır ve o tarihten önce iptal edebilirsiniz.
        </li>
      </ul>

      <h2>11. İadeler</h2>
      <p>
        Apex size uygun değilse, bir aboneliğin ilk ödemesinin veya yıllık bir yenilemenin tamamının iadesini ödemeden
        itibaren {n.refundDays} gün içinde isteyebilirsiniz. Aylık yenilemeler, iptalden sonra dönemin kalanı ve kullanılmış ek
        yanıtlar dahil diğer ödemeler, faturalandırma hatası ya da kanunun size iade hakkı tanıdığı durumlar (örneğin
        tüketicinin cayma hakkı) dışında iade edilmez. İadeleri Paddle, ödemenin yapıldığı yönteme yapar; talebinizi Paddle
        makbuzundaki bağlantıdan ya da bize e-postayla iletebilirsiniz.
      </p>

      <h2>12. Ek yanıtlar</h2>
      <p>
        Her plan, aylık dönem başına belirli sayıda yapay zekâ yanıtı içerir; hızlı bir modelde verilen yanıt beşte bir,
        Claude Opus 5.5'te iki, Claude Fable 5.1'de beş yanıt sayılır. Yanıtlar bittiğinde asistanınız yanıt vermek yerine
        devir formunu sunar ve ek ücret alınmaz. Ücretli bir planda faturalandırma ayarlarından ek yanıtları açabilirsiniz:{" "}
        {n.blockReplies} yanıt başına {n.blockPrice} tutarındadır, tam bloklar hâlinde ve belirlediğiniz aylık üst sınıra
        kadar kullanılır. Paddle bunları her aylık dönemin sonunda aboneliğinizin ödeme yönteminden tahsil eder; tutar hiçbir
        zaman üst sınırınızı aşmaz. Ek yanıtları istediğiniz zaman kapatabilir veya üst sınırı değiştirebilirsiniz; değişiklik
        o andan itibaren geçerlidir.
      </p>

      <h2>13. Kullanımın sona ermesi</h2>
      <p>
        Widget'ı sitenizden kaldırıp hesabınızın silinmesini talep ederek Apex'i istediğiniz zaman kullanmayı bırakabilirsiniz.
        Bu koşulları ihlal eden ya da hizmeti veya diğer müşterileri riske atan hesapları askıya alabiliriz.
      </p>

      <h2>14. Sorumluluk</h2>
      <p>
        Hizmet, beta süresince “olduğu gibi” sunulur. Kanunun izin verdiği ölçüde dolaylı veya sonuç olarak ortaya çıkan
        zararlardan sorumlu değiliz ve toplam sorumluluğumuz, talepten önceki on iki ayda bize ödediğiniz tutarla sınırlıdır.
      </p>

      <h2>15. Değişiklikler ve iletişim</h2>
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
