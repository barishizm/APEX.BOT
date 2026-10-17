# @apex/db

Kayıt / giriş için veritabanı şeması, migration çalıştırıcısı ve auth mantığı.

**Tasarım kararı:** Supabase'i şimdilik yalnızca *yönetilen PostgreSQL* olarak kullanıyoruz. Supabase Auth'u, `auth.*` şemasını ya da herhangi bir eklentiyi kullanmıyoruz. Kullanıcılar, şifre hash'leri, oturumlar ve doğrulama kodları bizim tablolarımızda (`app` şeması). Bu sayede kendi sunucumuza geçiş bir `pg_dump` / `pg_restore` işi; kod değişmez, sadece `DATABASE_URL` değişir.

Şemanın düz PostgreSQL'de çalıştığı testlerle kanıtlanıyor: testler, Supabase rolleri ya da eklentileri olmayan gömülü gerçek bir PostgreSQL'de (PGlite) koşuyor; biri de üretimdeki `pg` sürücüsüyle TCP üzerinden bağlanıyor.

## Tablolar (`migrations/`)

| Tablo | Ne tutar |
|---|---|
| `app.users` | e-posta (küçük harfe çevrilmiş, benzersiz), kullanıcı adı (büyük/küçük harf duyarsız benzersiz), scrypt şifre hash'i, hesap tipi, e-posta doğrulama zamanı, şartları kabul (zaman + sürüm), eğitim izni |
| `app.organizations` | Her hesaba kayıtta açılan çalışma alanı; business hesapta şirket adı ve büyüklüğü. İleride botlar/tenant'lar buna bağlanacak |
| `app.organization_members` | kullanıcı ↔ organizasyon, rol (`owner` / `admin` / `member`) |
| `app.sessions` | Oturumlar. Cookie'de rastgele token, tabloda sadece SHA-256'sı. "Beni hatırla" → 30 gün, değilse 1 gün + tarayıcı oturumu cookie'si |
| `app.verification_codes` | 6 haneli kodlar (hash'li), 15 dk geçerli, en fazla 5 deneme, kullanıcı başına tek canlı kod. `password_reset` amacı da şemada hazır |
| `app.oauth_accounts` | Google / GitHub ile giriş bağlantıları |
| `app.auth_events` | Güvenlik logu; başarısız girişler de burada sayılıp kısıtlanıyor (15 dk'da e-posta başına 10, IP başına 50) |
| `app.bots` | Çalışma alanı başına bir bot: ayarlar (JSON, uygulama doğrular), herkese açık `site_key`, `version` (iyimser kilit), `knowledge_version` |
| `app.knowledge_sources` / `app.knowledge_chunks` | Bilgi tabanı: web sitesi (taranır) veya metin kaynakları ve retrieval parçaları; her parça `bot_id` taşır |
| `app.knowledge_embeddings` | Parçaların embedding vektörleri (`bytea`, float32), `bot_id` + model + metin hash'iyle; sohbet API'si yazar ve bellekte arar. pgvector gerekmez ([ADR 0002](../../docs/adr/0002-hybrid-retrieval.md)) |
| `app.bot_activity` | Widget'ın en son hangi sitede ve ne zaman yüklendiği (sohbet API'si yazar) |
| `app.conversations` / `app.messages` | Panel botlarının konuşmaları; botun saklama süresi dolunca saatlik temizlikle silinir |
| `app.schema_migrations` | Hangi migration'ların uygulandığı |

Tüm tablolarda RLS açık ve hiç politika yok: Supabase'in `anon` / `authenticated` rolleri (REST API) hiçbir şeye erişemez; sunucu tablo sahibi olarak bağlandığı için etkilenmez. `app` şeması Supabase'in REST API'sinde zaten açık değil.

## Canlı veritabanı nerede?

**Canlı (production) veritabanı Neon'da.** Vercel'deki (web) ve Render'daki (`apex-api`) `DATABASE_URL` ona bağlı; ikisinde de gizli değişken olarak duruyor, panellerden geri okunamaz. Bağlantı adresinin tek kopyası Neon konsolu (ve şifre yöneticin).

`apps/web/.env.local` ise eski Supabase projesine (`JJ.bot`) bağlı bir **geliştirme** veritabanıdır. Yerelden çalıştırılan `npm run db:migrate` ve `npm run admin:bootstrap` oraya gider, canlıya değil. Canlıda bir şey yapmak için:

- Neon konsolu → projen → **SQL Editor**, ya da
- komutu canlı adresle çalıştır: `DATABASE_URL='<Neon adresi>' npm run admin:bootstrap -- sen@ornek.com`

Migration'ları canlıya Render'daki `apex-api` her deploy'da kendisi uygular (`render.yaml` build komutu).

## Supabase kurulumu (bir kerelik)

1. <https://supabase.com/dashboard> → **New project**. Bölge olarak kullanıcılara yakın birini seç (ör. `eu-central-1` Frankfurt). Veritabanı şifresini güçlü seç ve bir şifre yöneticisine kaydet.
2. Proje açılınca üstteki **Connect** düğmesine bas → **Connection string** → **Session pooler** satırındaki URI'yi kopyala. Şöyle görünür:
   ```
   postgresql://postgres.<proje-ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```
   ("Direct connection" sadece IPv6 üzerinden çalışır; ev/ofis ağlarında genelde Session pooler gerekir.) Şifrede `@`, `#`, `/` gibi karakterler varsa URL-encode et.
3. `apps/web/.env.example` dosyasını `apps/web/.env.local` olarak kopyala ve `DATABASE_URL`'i yapıştır (`[YOUR-PASSWORD]` yerine şifren). Bu dosya git'e girmez.
4. Kök dizinde:
   ```bash
   npm run db:migrate     # "Applied: 0001_auth.sql" yazmalı; tekrar çalıştırınca "Database is up to date."
   npm run dev:web
   ```
5. Kontrol: Supabase → **Table Editor** → şema seçicisinden `app`'i seç; tablolar orada olmalı.

E-posta: `RESEND_API_KEY` (ve `MAIL_FROM`) ayarlıysa kodlar Resend ile gönderilir. Anahtar yoksa geliştirmede e-postalar `npm run dev:web` çıktısına yazılır; üretimde gönderilmez ve hata loglanır.

## Google / GitHub ile giriş

Supabase Auth'un sağlayıcıları **kullanılmıyor** (kullanıcılar bizim `app` şemamızda); OAuth akışı uygulamanın kendi kodunda (`apps/web/lib/oauth.ts`, `app/api/auth/oauth/`), sonuç `app.oauth_accounts`'a yazılır. Çalışması için anahtarlar gerekir; boşsa düğmeler "henüz kurulmadı" hatası verir.

1. **Google:** Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* (Web application). Authorized redirect URI: `http://localhost:3000/api/auth/oauth/google/callback` (canlıda kendi alan adın).
2. **GitHub:** Settings → Developer settings → OAuth Apps → New. Authorization callback URL: `http://localhost:3000/api/auth/oauth/github/callback`.
3. `apps/web/.env.local` içine `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` ve `NEXT_PUBLIC_SITE_URL` yaz; dev sunucusunu yeniden başlat.

Kurallar: yalnızca sağlayıcının *doğruladığı* e-posta kabul edilir. Aynı e-postayla şifreli doğrulanmış hesap varsa kimlik ona bağlanır. Doğrulanmamış bir hesap varsa (e-postayı sahiplenmeden kayıt açılmış olabilir) gerçek sahip hesabı devralır: eski şifre ve oturumlar silinir.

## Kendi PostgreSQL sunucuna geçiş

1. Sunucuda PostgreSQL 13+ kur (gerekli tek özellik çekirdekteki `gen_random_uuid()`).
2. Veriyi taşı:
   ```bash
   pg_dump "$SUPABASE_URL" --schema=app --no-owner --no-privileges -Fc -f apex.dump
   pg_restore -d "$NEW_DATABASE_URL" --no-owner apex.dump
   ```
3. `DATABASE_URL`'i yeni sunucuya çevir. TLS yoksa (aynı makine / özel ağ) `DATABASE_SSL=off`; sertifikayı doğrulamak istersen `DATABASE_SSL=verify` ve gerekirse `DATABASE_CA_CERT`.
4. `npm run db:migrate` → "Database is up to date." görmelisin.

Şifre hash'leri, oturum token'ları ve kodlar tamamen bizim tablolarımızda olduğu için kimse yeniden şifre belirlemek zorunda kalmaz, açık oturumlar da devam eder.

## Yeni migration eklemek

`migrations/` altına bir sonraki numarayla dosya ekle (`0002_<ne>.sql`). Dosyalar ad sırasıyla, her biri kendi transaction'ında bir kez uygulanır. Uygulanmış bir dosyayı değiştirme; düzeltmeyi yeni bir migration olarak yaz. Sadece düz PostgreSQL kullan (Supabase'e özgü şema/rol/eklenti yok); Supabase rollerine dokunmak gerekiyorsa `0001`'deki gibi `pg_roles` kontrolüyle sar.

## Komutlar

```bash
npm run db:migrate              # kökten; apps/web/.env.local'daki DATABASE_URL'i kullanır
npm test -w @apex/db            # gömülü PostgreSQL üzerinde; sunucu gerektirmez
npm run typecheck -w @apex/db
```
