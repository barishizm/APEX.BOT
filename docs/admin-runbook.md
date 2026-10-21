# Yönetim paneli (admin) runbook'u

Apex Bot'un platform yönetimi `/admin` altındadır: kullanıcılar, çalışma alanları, botlar, bilgi kaynakları, kullanım ve maliyet, faturalama, güvenlik, destek talepleri, bekleme listesi, duyurular, ayarlar, sistem durumu ve audit kaydı. Bu belge panelin güvenlik modelini ve elle yapılması gereken işleri (ilk admin, 2FA kaybı, rol değişiklikleri, olaylar) anlatır.

> Canlı veritabanı **Neon**'dadır (ayrıntı: [`packages/db/README.md`](../packages/db/README.md#canlı-veritabanı-nerede)). Aşağıdaki SQL ve komutlar canlıda ya Neon konsolundaki **SQL Editor**'de ya da `DATABASE_URL='<Neon adresi>'` ile yerelden çalıştırılır. `apps/web/.env.local` geliştirme veritabanına bakar, canlıya değil.

## Roller ve korumalar

| Rol | Kim | Yapabildikleri |
|---|---|---|
| `superadmin` | Tek kişi; yalnızca `admin:bootstrap` ile atanır | Her şey: personel rolleri, platform ayarları, duyurular, "kullanıcı olarak görüntüle", içinde personel olan çalışma alanları |
| `support` | Superadmin'in `/admin/users/<id>` → Rol ile atadığı personel | Müşteri hesapları, çalışma alanları, botlar, bilgi kaynakları, destek talepleri, engeller. Başka bir personel hesabına ve **içinde personel olan bir çalışma alanına** (kendi alanı dahil) dokunamaz |
| — | Müşteriler | `/admin` ve `/api/admin/*` için 404/403 |

Her admin isteği şunlardan geçer (`apps/web/lib/auth.ts` → `requireAdminSession`):

1. **Başka siteden gelen istek reddedilir** (`Sec-Fetch-Site` `same-origin` ya da `none` olmalı): başka bir sitedeki link, personel adına CSV dışa aktaramaz.
2. Oturum geçerli, e-posta doğrulanmış, rol yeterli ve **iki adımlı giriş (2FA) açık** olmalı. "Kullanıcı olarak görüntüle" açıkken admin API kapalıdır.
3. IP, kullanıcı ve yazma başına hız sınırı.

Yazma işlemleri yalnızca `withAdminAction` (`apps/web/lib/admin.ts`) ile yapılır:

- JSON gövde zorunludur (`readJson`): başka sitedeki bir `<form>` CORS ön kontrolü olmadan JSON gönderemez (CSRF).
- Bir **gerekçe** (`reason`) zorunludur; yalnızca iç notlar hariç.
- Yıkıcı işlemler (silme, askıya alma, ücretsiz plan, webhook'u yeniden işleme, 2FA sıfırlama, görüntüleme…) son 10 dakikada doğrulama uygulamasından girilmiş bir kodla **step-up** ister. Kurtarma kodu step-up sayılmaz. Başarılı her step-up güvenlik kaydına `step_up` olarak düşer.
- Değişiklik ve audit kaydı **aynı transaction'da** yazılır: audit yazılamazsa değişiklik geri alınır. `app.admin_audit_log` yalnızca eklemeye açıktır (veritabanı tetikleyicileri güncellemeyi ve silmeyi reddeder).

Bunların unutulmaması testlerle korunur: `apps/web/test/admin-routes.test.ts`, `app/api/admin` altındaki her route dosyasını okur ve oturum kontrolü olmayan, JSON dışı gövde okuyan ya da (çalışma alanı, bot ve kaynak işlemlerinde) personel kontrolünü atlayan bir handler'da başarısız olur.

### "Kullanıcı olarak görüntüle" (impersonation)

- Yalnızca superadmin, step-up ve gerekçeyle; en fazla 30 dakika. Personel, askıdaki hesaplar ve kendi hesabı görüntülenemez.
- **Salt okunur**: tarayıcıda görüntüleme çerezi varken `proxy.ts` her POST/PUT/PATCH/DELETE isteğini (tek istisna `POST /api/admin/impersonation/exit`) route'a ulaşmadan 403 ile reddeder. Sayfa görüntülemek de bir şey yazmaz (henüz botu olmayan bir hesapta ilk bot oluşturulmaz).
- Ziyaretçi verileri maskelenir. Başlangıç, bitiş ve başka bir görüntülemeyle değiştirilme audit'e yazılır.

### Destek erişimi (konuşmalar)

Bir botun konuşmalarını okumak için `/admin/bots/<id>` → "Destek erişimi" bir saatlik izin açar: gerekçe zorunlu, çalışma alanı sahiplerine e-posta gider, içerik maskeli gelir; tek tek açılan her konuşma ve maskenin kaldırılması audit'e yazılır.

`/admin/conversations` konuşmaların yalnızca sayılarını gösterir (hacim, yanıtlanamayan oranı, geri bildirim, aktarımlar; bot bazında ve CSV olarak), hiçbir mesajı ya da ziyaretçi bilgisini göstermez. Aynı sayfanın **Destek erişimi** bölümü son 30 günde açılan her pencereyi kimin, hangi bot için, hangi gerekçeyle açtığını ve içinde kaç konuşma okunup kaç kez iletişim bilgisinin gösterildiğini listeler.

## İlk superadmin nasıl atanır

Bu yalnızca bir kez yapılır; bir superadmin varken komut başka bir hesabı superadmin yapmaz.

1. Siteden normal bir hesapla **kayıt ol** ve e-postana gelen kodla adresini **doğrula** (doğrulanmamış adres superadmin yapılmaz).
2. Canlı veritabanına karşı bootstrap komutunu çalıştır:
   ```bash
   DATABASE_URL='<Neon adresi>' DATABASE_SSL=verify npm run admin:bootstrap -- sen@ornek.com
   # ya da: DATABASE_URL='…' ADMIN_BOOTSTRAP_EMAIL=sen@ornek.com npm run admin:bootstrap
   ```
   Çıktı `Superadmin set: <id>` (ya da tekrar çalıştırınca `Already the superadmin: <id>`) olmalı. Kayıt audit'e `user.platform_role.bootstrap` olarak düşer.
   `ADMIN_BOOTSTRAP_EMAIL` yalnızca bu komutun okuduğu bir değişkendir; web uygulaması (Vercel) ve API onu kullanmaz.
3. Giriş yap → **Ayarlar → İki adımlı giriş**'i aç ve **kurtarma kodlarını** şifre yöneticine kaydet. 2FA olmadan admin paneli açılmaz.
4. `/admin`'e git. İlk yıkıcı işlemde panel doğrulama kodunu ister (step-up).

Destek personeli eklemek için: kişi kendi hesabını açıp doğrulasın ve 2FA'yı açsın; superadmin `/admin/users/<id>` → **Rol** → `support` (gerekçeyle). Rolü aynı yerden kaldırılır; askıya alınan personelin rolü de etkisiz olur.

## 2FA kaybolursa

### Destek personeli (`support`)

Superadmin `/admin/users/<id>` → **İki adımlı girişi sıfırla** (step-up + gerekçe). Doğrulama sırrı, kurtarma kodları ve yarım kalmış girişler silinir, kişiye e-posta gider; şifresiyle girip 2FA'yı yeniden açar. Telefon çalındıysa aynı sayfadan **Oturumları kapat** da yapılmalıdır. Destek personeli birbirinin 2FA'sını sıfırlayamaz.

### Superadmin, kurtarma kodları elinde

1. Giriş ekranında şifreden sonra doğrulama kodu yerine **bir kurtarma kodu** gir (her kod bir kez çalışır).
2. **Ayarlar → İki adımlı giriş → Kapat** (yine bir kurtarma koduyla), ardından yeni telefonla yeniden aç ve yeni kurtarma kodlarını kaydet.
3. Kurtarma koduyla açılan oturum step-up sayılmaz; admin işlemleri için yeni doğrulama uygulamasından kod gerekir.

### Superadmin, kurtarma kodları da yok

Paneli kullanacak başka bir superadmin olmadığı için sıfırlama veritabanında yapılır. Önce kimliği panel dışından doğrula (bu kişi gerçekten hesabın sahibi mi?). Sonra Neon SQL Editor'de, tek transaction içinde:

```sql
begin;
-- hesabı bul
select id, email, platform_role from app.users where email = 'sen@ornek.com';

-- 2FA'yı kapat, kurtarma kodlarını, yarım kalmış girişleri ve tüm oturumları sil
update app.users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = '<id>';
delete from app.recovery_codes where user_id = '<id>';
delete from app.login_challenges where user_id = '<id>';
delete from app.sessions where user_id = '<id>';

-- panel dışında yapıldığı için audit kaydını elle ekle (aktör yok = sistem)
insert into app.admin_audit_log (actor_id, action, target_type, target_id, reason, before, after)
values (null, 'user.reset_two_factor', 'user', '<id>', 'Superadmin lost authenticator and recovery codes; reset via SQL by <kim>',
        '{"twoFactor": true}', '{"twoFactor": false}');
commit;
```

Ardından şifreyle giriş yap, 2FA'yı hemen yeniden aç ve kurtarma kodlarını kaydet. Şifre de unutulduysa önce "Şifremi unuttum" akışını kullan (e-postaya kod gelir).

`TOTP_ENCRYPTION_KEY` değiştirilmemelidir: değişirse kayıtlı tüm 2FA sırları açılamaz ve herkes yalnızca kurtarma koduyla girebilir. Anahtar kaybolduysa yukarıdaki SQL her etkilenen hesap için gerekir.

## Superadmin değiştirmek

Panel superadmin rolünü kimseye veremez ve kimseden alamaz. Devir gerekiyorsa (kişi ayrılıyor, hesap ele geçirildi) SQL ile yapılır ve audit'e elle yazılır:

```sql
begin;
update app.users set platform_role = null where id = '<eski id>';
update app.users set platform_role = 'superadmin' where id = '<yeni id>' and email_verified_at is not null;
insert into app.admin_audit_log (actor_id, action, target_type, target_id, reason, before, after)
values (null, 'user.platform_role', 'user', '<yeni id>', '<neden, kim tarafından>', '{"platformRole": null}', '{"platformRole": "superadmin"}');
commit;
```

Hesap ele geçirildiyse eski hesabın oturumlarını da sil (`delete from app.sessions where user_id = '<eski id>'`) ve şifresini sıfırlat.

## Faturalama

Ödemeleri **Paddle** alır (merchant of record: vergiyi, faturayı, kartları, tahsilat denemelerini ve ödeme itirazlarını o yürütür; ayrıntı: [ADR 0003](adr/0003-billing.md)). Uygulama Paddle'ın webhook'larıyla aboneliği `app.subscriptions`'a yazar ve çalışma alanının planını ondan hesaplar. **Para ile ilgili her işlem (iade, iptal, plan değişikliği) Paddle panelinde yapılır**; admin panelinde para hareketi yoktur.

- **`/admin/billing`**: MRR/ARR (liste fiyatıyla, vergi ve indirim öncesi; yıllık plan 1/12 sayılır, deneme dahil değil), risk altındaki ve iptal edilecek gelir, durumlara göre abonelikler, plan dağılımı (ödeyen / ücretsiz plan (comp) / elle atanmış), ödemesi gecikenler, işlenmemiş webhook'lar ve son 12 ayın aşım gelirleri.
- **`/admin/workspaces/<id>` → Abonelik kartı**: durum, dönem, planlanan değişiklik, ek süre, Paddle'daki abonelik ve müşteri bağlantıları (`PADDLE_ENV`'e göre sandbox ya da canlı panel), ücretsiz planlar ve o çalışma alanına ait webhook geçmişi.

### Ücretsiz plan tanımak (comp)

Personelin elle yapabildiği tek plan değişikliği budur: `/admin/workspaces/<id>` → **Ücretsiz plan tanı (comp)** → plan, bitiş tarihi (en fazla 2 yıl) ve gerekçe; step-up ister, audit'e `organization.comp` olarak düşer. Bitiş günü çalışma alanı kendiliğinden Free'ye döner. Yeni bir comp, süren comp'un yerini alır; **Şimdi bitir** onu hemen sonlandırır (`organization.comp_revoke`).

- **Aboneliği olan bir çalışma alanına comp verilemez** (iptal edilmiş ama dönemi bitmemiş abonelik dahil): planı abonelik belirler ve Paddle'da değişir. Abonelik bittikten sonra comp verilebilir.
- Comp'lar öncesinde elle plan verilmiş (beta) çalışma alanları "Elle atanmış" görünür ve planlarını korur. Bitiş tarihi vermek için aynı plandan bir comp tanı. Hemen Free'ye düşürmek için bir comp tanıyıp **Şimdi bitir** de.
- Destek personeli, içinde personel olan bir çalışma alanına comp veremez (kendi alanı dahil); bunu superadmin yapar.

### Ödemesi gecikenler (past_due)

Yenileme ödemesi başarısız olunca abonelik `past_due` olur ve **7 günlük ek süre** başlar: plan bu sürede devam eder, sahiplere e-posta gider, Paddle ödemeyi kendisi yeniden dener. Ek süre biterse günlük cron (`/api/cron/billing-notices`) çalışma alanını Free'ye alır (`billing.grace_expired`). `/admin/billing` → **Ödemesi gecikenler** bunları ek sürenin bitişine göre sıralar. Müşteri ödeme yöntemini değiştirmek için **Ayarlar → Plan ve faturalandırma → Ödeme yöntemini güncelle**'yi kullanır. Ek süre elle uzatılmaz.

### Webhook'u yeniden işlemek

Her webhook işlenmeden önce `app.billing_events`'e yazılır. Uygulanamayan olay (çalışma alanı bulunamadı, müşteri uyuşmuyor, geçersiz durum geçişi, hata) işlenmemiş kalır ve `/admin/billing` → **İşlenmemiş webhook'lar**'da (ve `/admin/system`'de) hatasıyla listelenir. Paddle'ın kendi yeniden denemeleri bunu düzeltmez; yeniden işlemek bizim işimiz.

1. Hatayı oku ve **önce nedeni gider**:
   | Hata | Anlamı | Yapılacak |
   |---|---|---|
   | `unknown_organization` | Olayda imzalı `custom_data` yok ve abonelik/müşteri kayıtlı değil, ya da çalışma alanı silinmiş | Paddle'da müşteriyi bul; çalışma alanı silindiyse aboneliği Paddle'da iptal et ve olayı bırak |
   | `customer_mismatch` | Olaydaki müşteri, çalışma alanının kayıtlı müşterisi değil | **Körü körüne yeniden işleme.** Checkout verisi kopyalanmış ya da kurcalanmış olabilir: Paddle'da iki müşteriyi karşılaştır, gerekiyorsa yanlış aboneliği iade edip iptal et |
   | `subscription_mismatch`, `subscription_exists`, `invalid_transition` | Olay kayıtlı durumla çelişiyor (ikinci abonelik, sırası bozuk olay) | Paddle'daki gerçek durumu kontrol et; daha yeni bir olay zaten uygulandıysa yeniden işlemek bir şey değiştirmez ve olayı kapatır |
   | Başka bir hata | Veritabanı ya da kod hatası | Logları (`[billing] webhook`) incele, düzeltmeyi deploy et |
2. **Yeniden işle** → gerekçe → step-up kodu. Sonuç hemen gösterilir: `Uygulandı`, `Kayıtlı durumdan eski` (değişiklik yok, işlendi sayılır), ya da hâlâ uygulanamıyorsa hata. Her deneme audit'e `billing.webhook_replay` olarak, deneme sayısıyla düşer.
3. Yeniden işlemek güvenlidir: aynı olay iki kez uygulanmaz, kayıtlı durumdan eski bir olay hiçbir şeyi değiştirmez. Değişiklik ve audit kaydı aynı transaction'dadır.

Faturalama yapılandırılmamışsa (`/admin/system` → Faturalama) düğme kapalıdır. Olay hiç gelmediyse (bizim tarafta kayıt yok) Paddle panelinde **Developer tools → Notifications**'tan olayı yeniden gönder; aynı olay kimliğiyle gelir ve normal yoldan işlenir.

### İade (refund)

İadeyi Paddle yapar: **Paddle → Transactions → işlem → Refund** (tam ya da kısmi). Uygulama iade olaylarını işlemez; iade tek başına planı ya da aboneliği değiştirmez.

1. Çalışma alanının Abonelik kartından Paddle'daki müşteriye git, iade edilecek işlemi bul. Aşım ücretlerinin işlem kimliği `/admin/audit`'te `billing.overage_charged` kaydının gerekçesindedir.
2. İadeyi Paddle'da yap; gerekçeyi Paddle'a ve çalışma alanının **personel notuna** yaz.
3. Müşteri ayrılıyorsa aboneliği de Paddle'da iptal et: **hemen** (plan şimdi Free'ye düşer) ya da **dönem sonunda** (dönem bitene kadar plan sürer). Webhook gelince plan kendiliğinden güncellenir. Kartta durumun değiştiğini kontrol et.
4. Para yerine süre vermek istiyorsan: abonelik sürerken comp verilemez. Önce aboneliği iptal et, abonelik bitince comp tanı.

### Ödeme itirazı (chargeback)

Kart sahibi bankasından itiraz açarsa itirazı Paddle yürütür ve gerekirse bizden kanıt ister. Tutar ve itiraz ücreti Paddle'daki bakiyeden düşülür.

1. Paddle'dan gelen bildirimdeki işlemden müşteriyi ve çalışma alanını bul (Abonelik kartındaki müşteri kimliği, ya da `/admin/workspaces`'ta sahibin e-postası).
2. Kanıt isterse: hesabın oluşturulma tarihi, girişler (`/admin/users/<id>`), sitelerin ve konuşmaların sayısı (`/admin/workspaces/<id>`), aşım için o pencerenin kullanımı. **Konuşma içeriği ve ziyaretçi verisi gönderme.**
3. Aboneliğin durumunu Paddle'da kontrol et. Paddle aboneliği iptal ettiyse plan webhook'la düşer. İptal etmediyse ve itiraz kötü niyetliyse aboneliği Paddle'da **hemen** iptal et.
4. Dolandırıcılık şüphesi varsa çalışma alanını askıya al (`/admin/workspaces/<id>` → Askıya al) ve kullanıcıyı da askıya al. Gerekçeye itirazın Paddle kimliğini yaz.
5. İtiraz sonuçlanınca sonucu personel notuna ekle.

## Olay anında

| Durum | Ne yapılır |
|---|---|
| Bir müşteri hesabı kötüye kullanılıyor | `/admin/users/<id>` → Askıya al: tüm oturumları kapanır, giriş yapamaz. Botları çalışmaya devam eder; onları da durdurmak için çalışma alanını askıya al (`/admin/workspaces/<id>`) |
| Tek bir bot sorun çıkarıyor | `/admin/bots/<id>` → Devre dışı bırak. Sohbet API'si bir sonraki senkronda (≤ 30 sn) yalnızca kendi origin'lerine `503 out_of_service` döner, widget "hizmet dışı" mesajını gösterir. Ziyaretçinin konuşma silme isteği çalışmaya devam eder |
| Bir IP/ağdan saldırı | `/admin/security` → Engelle (en fazla 30 gün). Kendi adresin ve son 30 günde personelin giriş yaptığı adresler engellenemez |
| Bir personel hesabı ele geçirildi | Superadmin rolünü kaldırır (ya da hesabı askıya alır); `/admin/audit`'te o aktörün kayıtlarını filtreleyip neler yaptığını incele |
| Platform genelinde kayıtları durdurmak | `/admin/settings` → Kayıt modu `invite_only` ya da `closed` |

Audit kaydı `/admin/audit`'te aktöre, işleme ve hedefe göre filtrelenir, CSV olarak indirilebilir (indirme de audit'e yazılır).

## Deploy kontrol listesi

1. **Migration'lar:** Render'daki `apex-api` her deploy'da `npm run db:migrate` çalıştırır (`render.yaml` → `buildCommand`). Elle çalıştırmak gerekirse: `DATABASE_URL='<Neon adresi>' DATABASE_SSL=verify npm run db:migrate` → son satır `Applied: …` ya da `Database is up to date.` olmalı. Web uygulaması eksik migration görürse `/database-update` sayfasını gösterir.
2. **Vercel (web):** `TOTP_ENCRYPTION_KEY` (zorunlu, 2FA için), `APEX_HEALTH_TOKEN` (`/admin/system` için, API'dekiyle aynı), `TRUST_PROXY=1`. İsteğe bağlı: `SIGNUPS_MODE`, `SUPPORT_INBOX_EMAIL`.
3. **Render (API):** `APEX_HEALTH_TOKEN` aynı değer. Bot senkronu değiştiğinde API'yi yeniden deploy et; `/health` → `"botSync": "ok"` olmalı.
4. Deploy sonrası: superadmin ile giriş → `/admin/system`'de servisler yeşil → `/admin/audit`'te son kayıtlar görünüyor.

## Yerelde uçtan uca deneme

Postgres kurmadan, gömülü PGlite ile:

```bash
npm run db:local        # 127.0.0.1:5433'te PGlite; veri packages/db/.pglite'ta (git'e girmez)
# apps/web/.env.local ve apps/api/.env:
#   DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres
#   DATABASE_SSL=off
#   DATABASE_POOL_MAX=1   (PGlite tek oturumdur; fazla bağlantı transaction'ları karıştırır)
#   web için ayrıca TOTP_ENCRYPTION_KEY; API için APEX_MODEL=echo, APEX_EMBEDDINGS=off
npm run db:migrate
npm run build:widget && npm run dev:api
npm run dev:web         # e-posta kodları bu çıktıya yazılır
```

Sonra: kayıt ol ve doğrula → `npm run admin:bootstrap -- sen@ornek.com` → 2FA'yı aç → `/admin`. Sıfırdan başlamak için `packages/db/.pglite` klasörünü sil.
