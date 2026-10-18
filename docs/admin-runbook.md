# Yönetim paneli (admin) runbook'u

Apex Bot'un platform yönetimi `/admin` altındadır: kullanıcılar, çalışma alanları, botlar, bilgi kaynakları, kullanım ve maliyet, güvenlik, destek talepleri, bekleme listesi, duyurular, ayarlar, sistem durumu ve audit kaydı. Bu belge panelin güvenlik modelini ve elle yapılması gereken işleri (ilk admin, 2FA kaybı, rol değişiklikleri, olaylar) anlatır.

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
- Yıkıcı işlemler (silme, askıya alma, plan, 2FA sıfırlama, görüntüleme…) son 10 dakikada doğrulama uygulamasından girilmiş bir kodla **step-up** ister. Kurtarma kodu step-up sayılmaz. Başarılı her step-up güvenlik kaydına `step_up` olarak düşer.
- Değişiklik ve audit kaydı **aynı transaction'da** yazılır: audit yazılamazsa değişiklik geri alınır. `app.admin_audit_log` yalnızca eklemeye açıktır (veritabanı tetikleyicileri güncellemeyi ve silmeyi reddeder).

Bunların unutulmaması testlerle korunur: `apps/web/test/admin-routes.test.ts`, `app/api/admin` altındaki her route dosyasını okur ve oturum kontrolü olmayan, JSON dışı gövde okuyan ya da (çalışma alanı, bot ve kaynak işlemlerinde) personel kontrolünü atlayan bir handler'da başarısız olur.

### "Kullanıcı olarak görüntüle" (impersonation)

- Yalnızca superadmin, step-up ve gerekçeyle; en fazla 30 dakika. Personel, askıdaki hesaplar ve kendi hesabı görüntülenemez.
- **Salt okunur**: tarayıcıda görüntüleme çerezi varken `proxy.ts` her POST/PUT/PATCH/DELETE isteğini (tek istisna `POST /api/admin/impersonation/exit`) route'a ulaşmadan 403 ile reddeder. Sayfa görüntülemek de bir şey yazmaz (henüz botu olmayan bir hesapta ilk bot oluşturulmaz).
- Ziyaretçi verileri maskelenir. Başlangıç, bitiş ve başka bir görüntülemeyle değiştirilme audit'e yazılır.

### Destek erişimi (konuşmalar)

Bir botun konuşmalarını okumak için `/admin/bots/<id>` → "Destek erişimi" bir saatlik izin açar: gerekçe zorunlu, çalışma alanı sahiplerine e-posta gider, içerik maskeli gelir; tek tek açılan her konuşma ve maskenin kaldırılması audit'e yazılır.

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
