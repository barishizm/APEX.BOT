import type { Messages } from "./types"

type StepCopy = { title: string; description: string; cta: string }

const en = {
  // The "Go live" checklist (lib/setup-steps.ts)
  steps: {
    account: { title: "Create your Apex Bot account", description: "Your workspace and assistant are ready.", cta: "Account settings" },
    knowledge: {
      title: "Teach it your content",
      description: "Add your website or paste FAQs and policies. The assistant answers only from what you add here.",
      cta: "Add knowledge",
    },
    widget: { title: "Customize your widget", description: "Match the colors, name, greeting and tone to your brand.", cta: "Customize widget" },
    install: {
      title: "Allow your website and add the code",
      description: "List the addresses the widget may run on, then paste one line of code into your site.",
      cta: "Install widget",
    },
    test: {
      title: "See it live on your site",
      description: "Open your website. This step completes on its own once the widget loads there.",
      cta: "Open your website",
    },
    testNoSite: { title: "See it live on your site", description: "Allow your website first, then open it to see the widget there.", cta: "Add your website" },
    text: {
      title: "Add your FAQs and policies as text",
      description: "Paste answers that aren't on your website, so fewer questions end in “I don't know”.",
      cta: "Add text",
    },
    handoff: { title: "Let visitors reach a human", description: "Turn on hand-off so unanswered questions reach your team by email.", cta: "Set up hand-off" },
    leads: {
      title: "Capture leads before the chat",
      description: "Ask for an email (and optionally a name or phone) before the first message.",
      cta: "Set up lead capture",
    },
    conversations: {
      title: "Review your first conversations",
      description: "See what visitors ask and which questions the assistant couldn't answer.",
      cta: "Open conversations",
    },
  } satisfies Record<string, StepCopy>,
  stages: { goLive: "Go live", improve: "Improve answers" },

  // /dashboard/onboarding/list
  list: {
    title: "Set up your assistant",
    stagesLabel: "Setup stages",
    done: "(done)",
    completed: "(completed)",
    progress: "{done} of {total} done",
    guideTitle: "Read the setup guide",
    guideText: "Step-by-step instructions for WordPress, Shopify, Webflow and more.",
    guideCta: "Open docs",
    helpTitle: "Stuck? Write to us",
    helpText: "We answer every beta customer personally, usually within a day.",
    helpCta: "Email the team",
    helpSubject: "Apex Bot setup",
    preview: {
      chatting: "Chatting",
      assistant: "AI assistant",
      messages: [
        "Hello! Welcome to Crest Cycles. How can I help you?",
        "Is the Urban Pro e-bike back in stock in matte black?",
        "It is! It came back this week. You can order it on the product page.",
        "Great, thanks!",
      ],
    },
  },

  // /onboarding (first run)
  onboarding: {
    home: "Apex Bot home",
    titleForm: ["Confirm your website", "for a quick start"],
    titleFailed: "We couldn't read that site",
    titleReading: "Learning your website",
    ledeFailed: "You can try another address, or continue and add your content as text in the dashboard.",
    lede: "Apex reads your pages to learn your products, policies and tone. Your assistant stays private until you add it to your site.",
    urlLabel: "Your website URL",
    urlPlaceholder: "www.example-website.com",
    urlInvalid: "Enter a valid website URL, like www.example.com",
    urlMissing: "Enter your website URL to customize your setup",
    addFailed: "Couldn't add this website. Try again",
    network: "Couldn't reach the server. Check your connection and try again",
    created: "Created your assistant",
    allowed: "Allowed {host} to show the widget",
    readPages: { one: "Read {n} page from your website", other: "Read {n} pages from your website" },
    reading: "Reading your pages… this usually takes under a minute",
    allSet: "All set. Opening your dashboard…",
    readyToAnswer: "Ready to answer",
    goToDashboard: "Go to dashboard",
    settingUp: "Setting up…",
    tryAgain: "Try again",
    continue: "Continue",
    background: "Continue in the background",
    anyway: "Continue anyway",
    skip: "Skip for now",
    preview: {
      label: "Widget preview",
      badge: "Website widget preview",
      assistant: "Apex Assistant",
      answer: "Yes. If the bag is unopened, you can return it free of charge within 14 days of delivery.",
      reply: "It looks great. Thanks!",
      read: "Read",
      input: "Write a message...",
    },
  },

  // Fresh sign-in loader
  loader: ["Fetching", "Fixing", "Updating", "Placing", "Syncing", "Processing"],
}

export const setup: Messages<typeof en> = {
  en,
  tr: {
    steps: {
      account: { title: "Apex Bot hesabınızı oluşturun", description: "Çalışma alanınız ve asistanınız hazır.", cta: "Hesap ayarları" },
      knowledge: {
        title: "İçeriğinizi öğretin",
        description: "Web sitenizi ekleyin ya da SSS'lerinizi ve politikalarınızı yapıştırın. Asistan yalnızca buraya eklediklerinizden yanıt verir.",
        cta: "Bilgi ekle",
      },
      widget: { title: "Widget'ınızı özelleştirin", description: "Renkleri, ismi, karşılama mesajını ve üslubu markanıza uyarlayın.", cta: "Widget'ı özelleştir" },
      install: {
        title: "Web sitenize izin verin ve kodu ekleyin",
        description: "Widget'ın çalışabileceği adresleri listeleyin, ardından tek satırlık kodu sitenize yapıştırın.",
        cta: "Widget'ı yükle",
      },
      test: {
        title: "Sitenizde canlı görün",
        description: "Web sitenizi açın. Widget orada yüklendiğinde bu adım kendiliğinden tamamlanır.",
        cta: "Web sitenizi açın",
      },
      testNoSite: {
        title: "Sitenizde canlı görün",
        description: "Önce web sitenize izin verin, ardından widget'ı görmek için sitenizi açın.",
        cta: "Web sitenizi ekleyin",
      },
      text: {
        title: "SSS ve politikalarınızı metin olarak ekleyin",
        description: "Web sitenizde olmayan yanıtları yapıştırın; böylece daha az soru “bilmiyorum” ile sonuçlanır.",
        cta: "Metin ekle",
      },
      handoff: {
        title: "Ziyaretçilerin bir insana ulaşmasını sağlayın",
        description: "İnsana devri açın; yanıtlanamayan sorular e-postayla ekibinize ulaşsın.",
        cta: "İnsana devri ayarla",
      },
      leads: {
        title: "Sohbetten önce potansiyel müşteri bilgisi toplayın",
        description: "İlk mesajdan önce e-posta (isteğe bağlı olarak ad veya telefon) isteyin.",
        cta: "Bilgi toplamayı ayarla",
      },
      conversations: {
        title: "İlk konuşmalarınızı inceleyin",
        description: "Ziyaretçilerin neler sorduğunu ve asistanın hangi soruları yanıtlayamadığını görün.",
        cta: "Konuşmaları aç",
      },
    },
    stages: { goLive: "Yayına alın", improve: "Yanıtları iyileştirin" },

    list: {
      title: "Asistanınızı kurun",
      stagesLabel: "Kurulum aşamaları",
      done: "(tamamlandı)",
      completed: "(tamamlandı)",
      progress: "{total} adımdan {done} tanesi tamamlandı",
      guideTitle: "Kurulum rehberini okuyun",
      guideText: "WordPress, Shopify, Webflow ve daha fazlası için adım adım talimatlar.",
      guideCta: "Dokümantasyonu aç",
      helpTitle: "Takıldınız mı? Bize yazın",
      helpText: "Her beta müşterimize bizzat, genellikle bir gün içinde yanıt veriyoruz.",
      helpCta: "Ekibe e-posta gönderin",
      helpSubject: "Apex Bot kurulumu",
      preview: {
        chatting: "Sohbette",
        assistant: "Yapay zekâ asistanı",
        messages: [
          "Merhaba! Crest Cycles'a hoş geldiniz. Size nasıl yardımcı olabilirim?",
          "Urban Pro elektrikli bisikletin mat siyahı tekrar stoklarda mı?",
          "Evet! Bu hafta tekrar geldi. Ürün sayfasından sipariş verebilirsiniz.",
          "Harika, teşekkürler!",
        ],
      },
    },

    onboarding: {
      home: "Apex Bot ana sayfa",
      titleForm: ["Hızlı bir başlangıç için", "web sitenizi onaylayın"],
      titleFailed: "Bu siteyi okuyamadık",
      titleReading: "Web siteniz öğreniliyor",
      ledeFailed: "Başka bir adres deneyebilir ya da devam edip içeriğinizi panelde metin olarak ekleyebilirsiniz.",
      lede: "Apex, ürünlerinizi, politikalarınızı ve üslubunuzu öğrenmek için sayfalarınızı okur. Asistanınız sitenize ekleyene kadar gizli kalır.",
      urlLabel: "Web sitenizin adresi",
      urlPlaceholder: "www.ornek-site.com",
      urlInvalid: "www.ornek.com gibi geçerli bir web sitesi adresi girin",
      urlMissing: "Kurulumu size göre uyarlamak için web sitenizin adresini girin",
      addFailed: "Bu web sitesi eklenemedi. Tekrar deneyin",
      network: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin",
      created: "Asistanınız oluşturuldu",
      allowed: "{host} için widget gösterimine izin verildi",
      readPages: { one: "Web sitenizden {n} sayfa okundu", other: "Web sitenizden {n} sayfa okundu" },
      reading: "Sayfalarınız okunuyor… bu genellikle bir dakikadan kısa sürer",
      allSet: "Her şey hazır. Paneliniz açılıyor…",
      readyToAnswer: "Yanıt vermeye hazır",
      goToDashboard: "Panele git",
      settingUp: "Kuruluyor…",
      tryAgain: "Tekrar dene",
      continue: "Devam et",
      background: "Arka planda devam et",
      anyway: "Yine de devam et",
      skip: "Şimdilik atla",
      preview: {
        label: "Widget önizlemesi",
        badge: "Web sitesi widget önizlemesi",
        assistant: "Apex Asistan",
        answer: "Evet. Çanta açılmamışsa, teslimattan itibaren 14 gün içinde ücretsiz iade edebilirsiniz.",
        reply: "Harika görünüyor. Teşekkürler!",
        read: "Okundu",
        input: "Bir mesaj yazın...",
      },
    },

    loader: ["Getiriliyor", "Düzeltiliyor", "Güncelleniyor", "Yerleştiriliyor", "Eşitleniyor", "İşleniyor"],
  },
}
