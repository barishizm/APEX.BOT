# Apex Bot

Apex Bot, web sitelerine eklenen bir AI asistanıdır. Ziyaretçilerin sorularını site içeriğine dayanarak yanıtlayan, tek bir `<script>` satırıyla kurulabilen bir sohbet widget'ı ve bunu besleyen bir backend'den oluşur.

Apex Bot **kapalı kaynaklı, ticari bir SaaS** ürünüdür: birçok müşteri sitesine abonelikle sunulur, tamamı bizim tarafımızda barındırılır. Yapay zekâ modelleri kendi altyapımızda değil, **bulut API'leri üzerinden** çalışır.

> **Durum:** Planlama aşaması. Bu doküman hedefleri, mimariyi ve yol haritasını tanımlar; teknoloji seçimleri başlangıç önerileridir ve kesinleşmemiştir.

## Verilen kararlar

| Konu | Karar |
|---|---|
| Model | Ürün kapalı kaynak, ticari SaaS; birden fazla müşteri sitesine satılacak |
| Barındırma | Yalnızca bulut (biz barındırırız); self-host yok |
| Yapay zekâ | Modeller API üzerinden çalışır (Claude API); kendi GPU/model altyapısı yok |
| Diller | Türkçe ve İngilizce |
| İnsana devir | E-posta formu (canlı destek entegrasyonu yok) |

---

## İçindekiler

1. [Hedefler](#hedefler)
2. [Kapsam](#kapsam)
3. [Özellikler](#özellikler)
4. [Mimari](#mimari)
5. [Önerilen teknoloji yığını](#önerilen-teknoloji-yığını)
6. [Bilgi tabanı (RAG)](#bilgi-tabanı-rag)
7. [Widget entegrasyonu](#widget-entegrasyonu)
8. [API taslağı](#api-taslağı)
9. [Güvenlik ve gizlilik](#güvenlik-ve-gizlilik)
10. [Kalite ve değerlendirme](#kalite-ve-değerlendirme)
11. [Maliyet kontrolü](#maliyet-kontrolü)
12. [Proje yapısı](#proje-yapısı)
13. [Kurulum (taslak)](#kurulum-taslak)
14. [Yol haritası](#yol-haritası)
15. [Açık sorular](#açık-sorular)

---

## Hedefler

- Bir web sitesine **5 dakikada** eklenebilen, kod bilgisi gerektirmeyen bir asistan.
- Yanıtlar **sitenin kendi içeriğine** dayanmalı; bilmediği şeyi uydurmamalı, bilmediğinde bunu söylemeli ve insana yönlendirmeli.
- Hızlı: ilk token < 1 sn hedefi, yanıtlar akış (streaming) ile gelir.
- Site sahibi markasına uyarlayabilmeli: ton, renk, isim, karşılama mesajı.
- Varsayılan olarak güvenli ve gizlilik dostu (KVKK/GDPR uyumlu tasarım).

## Kapsam

**Kapsam içi (v1)**

- Metin tabanlı sohbet widget'ı (web, mobil uyumlu)
- Site içeriğinden otomatik bilgi tabanı oluşturma
- Kaynak gösterimi (yanıtın hangi sayfadan geldiği)
- Yönetim paneli: içerik, ayarlar, konuşma geçmişi
- Çok kiracılı SaaS altyapısı: hesaplar, planlar, kullanım kotaları, faturalama
- Türkçe ve İngilizce
- İnsana devir: e-posta formu
- Temel analitik

**Kapsam dışı (şimdilik)**

- Self-host / on-premise kurulum
- Kendi barındırdığımız modeller (fine-tuning, GPU altyapısı)
- Türkçe/İngilizce dışındaki diller
- Canlı destek araçları entegrasyonu (Intercom, Zendesk vb.)
- Sesli asistan
- WhatsApp / Instagram vb. kanallar
- Ödeme alma gibi işlem yapan (transactional) akışlar

## Özellikler

### Ziyaretçi tarafı

- Sağ alt köşede açılır sohbet balonu
- Akışlı (streaming) yanıtlar, Markdown desteği
- Önerilen hızlı sorular
- Yanıtlarda kaynak linkleri
- Beğen / beğenme geri bildirimi
- İki dil: ziyaretçinin yazdığı dilde (Türkçe/İngilizce) yanıt, arayüz metinleri de iki dilli
- Erişilebilirlik: klavye gezinmesi, ekran okuyucu etiketleri, kontrast
- "Bir insanla konuş" seçeneği: ziyaretçi e-posta formunu doldurur, konuşma özeti ve iletişim bilgisi site sahibinin e-postasına gider

### Site sahibi tarafı

- Kaynak ekleme: URL tarama, sitemap, PDF/Markdown/metin yükleme, SSS
- Kişilik ve ton ayarı (resmî, samimi, kısa, ayrıntılı)
- Konu sınırları: asistanın konuşmaması gereken konular
- Konuşma geçmişi ve yanıtlanamayan soruların listesi (içerik boşluklarını gösterir)
- Lead toplama: yanıtlayamazsa iletişim bilgisi isteme
- Domain izin listesi (widget sadece onaylı sitelerde çalışır)

## Mimari

```
┌──────────────────────┐        ┌───────────────────────────────────────┐
│  Müşterinin sitesi   │        │             Apex Backend              │
│                      │        │                                       │
│  <script apex.js>    │ HTTPS  │  API Gateway  ──►  Chat Orkestratörü  │
│  Sohbet widget'ı  ───┼───────►│  (auth, rate       │                  │
│  (Shadow DOM)        │  SSE   │   limit, CORS)     ├─► Retriever ──► Vektör DB
└──────────────────────┘        │                    ├─► LLM (Claude)   │
                                │                    └─► Konuşma deposu │
┌──────────────────────┐        │                                       │
│  Yönetim paneli      │───────►│  Ingestion worker (tarama, parçalama, │
│  (site sahibi)       │        │  embedding) ◄── iş kuyruğu            │
└──────────────────────┘        └───────────────────────────────────────┘
```

### Bir mesajın yolu

1. Widget mesajı `site_key` ile birlikte backend'e gönderir.
2. Gateway `site_key` + `Origin` kontrolü yapar, rate limit uygular.
3. Orkestratör konuşma geçmişini yükler, soruyu bağımsız bir arama sorgusuna dönüştürür.
4. Retriever, o siteye ait vektör deposundan ilgili parçaları getirir.
5. Sistem istemi (ton, kurallar) + getirilen parçalar + geçmiş LLM'e gönderilir.
6. Yanıt SSE ile token token widget'a akar; kaynaklar yanıtın sonunda eklenir.
7. Konuşma kaydedilir (saklama politikasına göre).

### Çok kiracılık (multi-tenant)

Her site bir **tenant**'tır. Vektör verisi, ayarlar ve konuşmalar `tenant_id` ile kesin biçimde ayrılır; retrieval sorgusu `tenant_id` filtresi olmadan çalışamaz.

## Önerilen teknoloji yığını

| Katman | Öneri | Not |
|---|---|---|
| LLM | Claude API (Sonnet sınıfı model; basit sorular için Haiku) | Akış, prompt caching, tool use |
| Backend | TypeScript + Node.js (Hono veya Fastify) | Widget ile tek dil |
| Veritabanı | PostgreSQL + `pgvector` | Tek veritabanı: ilişkisel veri + vektörler. Ölçek büyürse ayrı vektör DB |
| Kuyruk | BullMQ + Redis (veya Postgres tabanlı kuyruk) | Tarama ve embedding işleri |
| Embedding | Çok dilli bir embedding modeli | Türkçe kalitesi test edilerek seçilecek |
| Widget | Vanilla TS veya Preact, Shadow DOM, ~30 KB altı | Müşteri sitesinin CSS'iyle çakışmaz |
| Yönetim paneli | Next.js | |
| Barındırma | Container tabanlı (Fly.io / Railway / AWS) | |
| Gözlemlenebilirlik | OpenTelemetry + log/trace paneli | Prompt ve yanıt izleme |

Neden `pgvector`? İlk sürümde operasyonel yükü en düşük seçenek; tenant filtresi ve ilişkisel veriyle aynı sorguda çalışır.

## Bilgi tabanı (RAG)

**Ingestion hattı**

1. **Toplama:** URL/sitemap tarama (robots.txt'e saygılı), dosya yükleme, manuel SSS.
2. **Temizleme:** Menü, footer, çerez bannerı gibi gürültüyü at; ana içeriği çıkar (Readability benzeri).
3. **Parçalama:** Başlık yapısını koruyan, ~300–500 token'lık parçalar, küçük örtüşmeyle. Her parçada sayfa başlığı ve URL meta olarak tutulur.
4. **Embedding ve indeksleme:** Parçalar vektör olarak saklanır; ayrıca anahtar kelime araması için tam metin indeksi.
5. **Yenileme:** Zamanlanmış yeniden tarama + içerik hash'i ile sadece değişen sayfaları güncelle.

**Retrieval**

- Hibrit arama: vektör + tam metin (BM25), sonuçlar birleştirilir.
- Gerekirse yeniden sıralama (reranker).
- Eşik altı skor → "bilmiyorum" yolu: asistan uydurmaz, insana yönlendirir.

## Widget entegrasyonu

Hedef kullanım:

```html
<script
  src="https://cdn.apex.bot/widget.js"
  data-site-key="apex_pk_xxxxxxxx"
  async
></script>
```

İsteğe bağlı yapılandırma:

```html
<script>
  window.Apex = {
    theme: { primary: "#4f46e5", position: "bottom-right" },
    greeting: "Merhaba! Size nasıl yardımcı olabilirim?",
    lang: "auto",
    suggestions: ["Fiyatlar nedir?", "İade politikası", "İletişim"]
  };
</script>
```

JavaScript API (taslak): `Apex.open()`, `Apex.close()`, `Apex.send(text)`, `Apex.identify({ name, email })`, `Apex.on("message", fn)`.

Teknik kararlar: Shadow DOM ile stil izolasyonu, `site_key` herkese açık (yalnızca domain izin listesiyle kullanılabilir), gizli anahtarlar asla istemciye gitmez.

## API taslağı

| Yöntem | Yol | Açıklama |
|---|---|---|
| `POST` | `/v1/chat` | Mesaj gönder, SSE ile yanıt al |
| `GET` | `/v1/conversations/:id` | Konuşma geçmişi |
| `POST` | `/v1/feedback` | Mesaj geri bildirimi |
| `POST` | `/v1/sources` | Kaynak ekle (URL, dosya) |
| `GET` | `/v1/sources` | Kaynakları ve indeks durumunu listele |
| `DELETE` | `/v1/sources/:id` | Kaynağı ve vektörlerini sil |
| `GET` | `/v1/analytics` | Özet metrikler |

## Güvenlik ve gizlilik

Halka açık bir chatbot saldırı yüzeyidir; bunlar baştan tasarıma dahildir:

- **Prompt injection:** Getirilen site içeriği ve kullanıcı mesajı *veri* olarak işaretlenir, talimat olarak değil. Asistanın erişimi olan araçlar asgari tutulur; v1'de yan etkili araç yok.
- **Sistem istemi sızıntısı:** İstem gizli kabul edilmez ama içine sır (anahtar, iç URL) konmaz.
- **Kötüye kullanım:** IP ve site başına rate limit, mesaj uzunluğu sınırı, bot/spam tespiti (ör. Turnstile), günlük token bütçesi.
- **Domain doğrulama:** `Origin` kontrolü ve izin listesi; CORS sıkı tutulur.
- **Tenant izolasyonu:** Her sorguda zorunlu `tenant_id` filtresi, testlerle doğrulanır.
- **Kişisel veri:** E-posta, telefon, kart numarası gibi verileri loglardan maskele. Konuşma saklama süresi tenant başına ayarlanabilir (varsayılan 30 gün).
- **KVKK / GDPR:** Aydınlatma metni linki widget'ta gösterilir, ziyaretçinin verisini silme talebi için uç nokta, veri işleme sözleşmesi şablonu.
- **Yanıt güvenliği:** Tıbbi/hukuki/finansal konularda kesin tavsiye vermeme; site sahibinin tanımladığı yasak konular.
- **Şeffaflık:** Ziyaretçi bir yapay zekâyla konuştuğunu açıkça görür.

## Kalite ve değerlendirme

- **Altın soru seti:** Her tenant için (veya örnek siteler için) soru → beklenen yanıt/kaynak çiftleri; her değişiklikte otomatik çalıştırılır.
- **Metrikler:** Doğruluk (kaynağa sadakat), retrieval isabeti (recall@k), "bilmiyorum" oranı, 👍/👎 oranı, ilk token süresi, konuşma başına maliyet.
- **Halüsinasyon kontrolü:** Yanıtın getirilen parçalarla desteklenip desteklenmediğini kontrol eden LLM-hakem testi.
- **Kırmızı takım testi:** Prompt injection, jailbreak ve konu dışı yönlendirme senaryoları regresyon paketinde.
- **Test piramidi:** Birim testler (parçalama, filtreleme), entegrasyon testleri (ingestion → retrieval → yanıt), uçtan uca widget testi (Playwright).

## Maliyet kontrolü

- Prompt caching: sistem istemi ve sabit bağlam önbelleğe alınır.
- Model yönlendirme: basit/SSS benzeri sorularda küçük model, karmaşık olanlarda büyük model.
- Bağlam bütçesi: getirilen parça sayısı ve konuşma geçmişi uzunluğu sınırlı.
- Tenant bazlı kota ve kullanım raporu.
- Sık sorulan soruların yanıt önbelleği (dikkat: kişiselleştirilmiş yanıtlar önbelleğe alınmaz).

## Proje yapısı

Önerilen monorepo düzeni:

```
apex-bot/
├── apps/
│   ├── api/            # Backend: gateway + chat orkestratörü
│   ├── worker/         # Ingestion işleri (tarama, parçalama, embedding)
│   ├── dashboard/      # Yönetim paneli
│   └── widget/         # Gömülebilir sohbet widget'ı
├── packages/
│   ├── core/           # Ortak tipler, prompt şablonları, retrieval mantığı
│   └── evals/          # Değerlendirme setleri ve çalıştırıcı
├── docs/               # Mimari kararlar (ADR), API dokümanı
├── .env.example
└── README.md
```

## Kurulum (taslak)

> Kod henüz yazılmadı; aşağıdaki adımlar hedeflenen geliştirici deneyimidir.

```bash
git clone <repo-url> apex-bot && cd apex-bot
cp .env.example .env        # anahtarları doldur
docker compose up -d        # Postgres (pgvector) + Redis
pnpm install
pnpm db:migrate
pnpm dev                    # api + worker + dashboard + widget
```

Ortam değişkenleri (taslak):

| Değişken | Açıklama |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API anahtarı |
| `DATABASE_URL` | PostgreSQL bağlantısı |
| `REDIS_URL` | Kuyruk için Redis |
| `EMBEDDING_API_KEY` | Embedding sağlayıcısı anahtarı |
| `JWT_SECRET` | Yönetim paneli oturumları |
| `PUBLIC_WIDGET_URL` | Widget'ın servis edildiği adres |

## Yol haritası

**Faz 0 – Temel (1–2 hafta)**
- [ ] Teknoloji kararlarının kesinleşmesi (ADR'ler)
- [ ] Monorepo iskeleti, CI, lint/test altyapısı
- [ ] Tek bir örnek site için elle hazırlanmış bilgi tabanı

**Faz 1 – MVP (3–5 hafta)**
- [ ] `/v1/chat` akışlı yanıt, sistem istemi, geçmiş yönetimi
- [ ] URL tarama → parçalama → embedding → retrieval
- [ ] Temel widget (aç/kapa, akış, kaynak linkleri)
- [ ] Site anahtarı + domain izin listesi + rate limit
- [ ] İlk değerlendirme seti

**Faz 2 – Ürünleşme**
- [ ] Yönetim paneli (kaynaklar, ayarlar, konuşmalar)
- [ ] Tema ve kişilik özelleştirme
- [ ] Hibrit arama + reranker
- [ ] Analitik, geri bildirim, yanıtlanamayan soru raporu
- [ ] İnsana devretme (e-posta formu), lead toplama
- [ ] Hesaplar, planlar, kullanım kotaları ve faturalama (satış için gerekli)
- [ ] KVKK araçları (silme, saklama süresi)

**Faz 3 – Büyüme**
- [ ] Araç kullanımı (ör. randevu, sipariş durumu sorgulama)
- [ ] Eklentiler: WordPress, Shopify, Webflow
- [ ] Canlı destek araçları entegrasyonu (talep olursa)
- [ ] Yeni diller (talep olursa)
- [ ] Ek kanallar (WhatsApp vb.)

## Açık sorular

1. **Fiyatlandırma:** Aylık sabit plan mı, kullanıma (mesaj/token) dayalı mı, ikisinin karışımı mı? Model maliyeti API'den geldiği için marjı doğrudan etkiler.
2. **Ödeme sağlayıcısı:** Türkiye'deki müşteriler için iyzico/PayTR, yurt dışı için Stripe gibi bir ayrım gerekir mi?
3. **Veri bölgesi:** Müşteriler verinin Türkiye/AB içinde kalmasını isteyecek mi? Mesajlar üçüncü taraf model API'sine gittiği için gizlilik sözleşmesinde ve aydınlatma metninde belirtilmeli.
4. **Müşteri başlangıcı (onboarding):** Self-servis kayıt mı, yoksa ilk müşterilerde kurulumu biz mi yapacağız?
5. **İsim ve marka:** Ürün adı "Apex Bot" olarak belirlendi. Asistanın bir kişiliği/karakteri olacak mı, widget içinde bu isimle mi anılacak?

---

## Lisans

Tüm hakları saklıdır (proprietary). Bu depo açık kaynak değildir ve izinsiz kopyalanamaz, dağıtılamaz. Depoyu özel (private) tutun ve bağımlılık lisanslarını (özellikle AGPL/GPL) ticari kullanım açısından kontrol edin.
