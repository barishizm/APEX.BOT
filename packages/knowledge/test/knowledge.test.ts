import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import {
  CrawlError,
  FetchError,
  KnowledgeBase,
  checkUrl,
  chunkPage,
  chunkText,
  crawlSite,
  extractPage,
  isPublicAddress,
  normalizeStartUrl,
  packParagraphs,
  parseRobots,
  parseSitemap,
  safeFetch,
  type Fetcher,
} from "../src/index.ts";

describe("SSRF guard", () => {
  it("classifies addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "::7f00:1", "64:ff9b:1::7f00:1"]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(ip), true, ip);
    assert.equal(isPublicAddress("not-an-ip"), false);
  });

  it("refuses unsafe URLs before connecting", () => {
    for (const url of ["ftp://example.com", "http://user:pw@example.com", "http://example.com:8080", "http://127.0.0.1/", "http://[::1]/", "http://localhost/", "http://printer.local/", "file:///etc/passwd"]) {
      assert.throws(() => checkUrl(url), FetchError, url);
    }
    assert.equal(checkUrl("https://example.com/a").hostname, "example.com");
  });
});

describe("safeFetch", () => {
  let server: Server;
  let base: string;
  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/gz") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" });
        return res.end(gzipSync("<p>Sıkıştırılmış içerik</p>"));
      }
      if (req.url === "/latin") {
        res.writeHead(200, { "content-type": "text/html; charset=windows-1254" });
        return res.end(Buffer.from([0x3c, 0x70, 0x3e, 0xfe, 0x69, 0x6b, 0xe2, 0x79, 0x65, 0x74])); // <p>şikâyet
      }
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/gz" });
        return res.end();
      }
      if (req.url === "/big") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("x".repeat(5000));
      }
      if (req.url === "/pdf") {
        res.writeHead(200, { "content-type": "application/pdf" });
        return res.end("%PDF");
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  it("blocks private addresses unless explicitly allowed", async () => {
    await assert.rejects(safeFetch(`${base}/gz`), (e: FetchError) => e.code === "blocked");
  });

  it("decompresses, follows redirects and decodes Turkish charsets", async () => {
    const gz = await safeFetch(`${base}/redirect`, { allowPrivate: true });
    assert.equal(gz.url, `${base}/gz`);
    assert.match(gz.body, /Sıkıştırılmış/);
    const latin = await safeFetch(`${base}/latin`, { allowPrivate: true });
    assert.equal(latin.body, "<p>şikâyet");
  });

  it("enforces size, type and status", async () => {
    await assert.rejects(safeFetch(`${base}/big`, { allowPrivate: true, maxBytes: 1000 }), (e: FetchError) => e.code === "too_large");
    await assert.rejects(safeFetch(`${base}/pdf`, { allowPrivate: true }), (e: FetchError) => e.code === "bad_type");
    await assert.rejects(safeFetch(`${base}/missing`, { allowPrivate: true }), (e: FetchError) => e.code === "bad_status");
  });
});

describe("robots.txt and sitemaps", () => {
  it("caps the rules it reads so matching stays cheap", () => {
    const many = Array.from({ length: 5000 }, (_, i) => `Disallow: /r${i}/`).join("\n");
    const robots = parseRobots(`User-agent: *\n${many}`);
    assert.equal(robots.isAllowed("/r0/x"), false);
    assert.equal(robots.isAllowed("/r4999/x"), true, "rules past the cap are ignored");
    const longAllow = parseRobots(`User-agent: *\nDisallow: /a\nAllow: /a${"b".repeat(600)}`);
    assert.equal(longAllow.isAllowed(`/a${"b".repeat(600)}`), false, "an over-long Allow does not open a Disallow");
  });

  it("matches wildcard rules and sitemap locs in linear time", () => {
    const start = Date.now();
    const robots = parseRobots("User-agent: *\nDisallow: /*a*a*a*a*a*ab\nDisallow: /*.pdf$");
    assert.equal(robots.isAllowed("/" + "a".repeat(300)), true);
    assert.equal(robots.isAllowed("/x/" + "a".repeat(300) + "b"), false);
    assert.equal(robots.isAllowed("/doc.pdf"), false);
    assert.equal(robots.isAllowed("/doc.pdf?x=1"), true);
    const padded = parseSitemap("<loc>" + " ".repeat(1_000_000) + "</loc><loc> https://a.example/ </loc>");
    assert.deepEqual(padded.pages, ["https://a.example/"]);
    assert.ok(Date.now() - start < 1000);
  });

  it("applies the most specific rule for our agent group, or *", () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /admin
Allow: /admin/help
Disallow: /*.php$

User-agent: GPTBot
Disallow: /

Sitemap: https://example.com/sitemap.xml
`);
    assert.equal(robots.isAllowed("/"), true);
    assert.equal(robots.isAllowed("/admin/users"), false);
    assert.equal(robots.isAllowed("/admin/help/faq"), true);
    assert.equal(robots.isAllowed("/index.php"), false);
    assert.equal(robots.isAllowed("/index.php?x=1"), true);
    assert.deepEqual(robots.sitemaps, ["https://example.com/sitemap.xml"]);
    assert.equal(parseRobots("User-agent: ApexBot\nDisallow: /\n\nUser-agent: *\nAllow: /").isAllowed("/x"), false);
    assert.equal(parseRobots("User-agent: *\nDisallow:").isAllowed("/x"), true);
  });

  it("reads sitemaps and sitemap indexes", () => {
    assert.deepEqual(parseSitemap("<urlset><url><loc>https://a.com/x?a=1&amp;b=2</loc></url><url><loc> https://a.com/y </loc></url></urlset>").pages, [
      "https://a.com/x?a=1&b=2",
      "https://a.com/y",
    ]);
    assert.deepEqual(parseSitemap("<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>"), { pages: [], sitemaps: ["https://a.com/s1.xml"] });
  });
});

const PAGE = `<!doctype html><html><head><title>Kargo ve İade | Kahve Dükkanı</title>
<meta name="description" content="Kargo süreleri ve iade koşulları."></head>
<body>
<header class="site-header"><nav><a href="/">Ana sayfa</a><a href="/urunler">Ürünler</a></nav></header>
<div class="cookie-banner">Çerezleri kabul ediyor musunuz? <button>Kabul</button></div>
<main>
  <h1>Kargo ve İade</h1>
  <p>Siparişler 1-3 iş günü içinde kargoya verilir. 750 TL üzeri siparişlerde kargo ücretsizdir.</p>
  <h2>İade koşulları</h2>
  <p>Açılmamış paketleri teslimattan sonraki 14 gün içinde ücretsiz iade edebilirsiniz.</p>
  <ul><li>Öğütülmüş kahve iade edilemez.</li><li>İade kargosu bizden.</li></ul>
  <script>track()</script>
  <form><input name="q"></form>
  <a href="/iletisim#form">İletişim</a> <a href="mailto:x@y.com">mail</a> <a href="https://other.com/x">dış</a>
</main>
<footer>© 2026 Kahve Dükkanı · <a href="/gizlilik">Gizlilik</a></footer>
</body></html>`;

describe("extractPage", () => {
  it("keeps the main content by heading and drops site chrome", () => {
    const page = extractPage(PAGE, "https://kahve.example/kargo");
    assert.equal(page.title, "Kargo ve İade | Kahve Dükkanı");
    assert.equal(page.description, "Kargo süreleri ve iade koşulları.");
    const all = page.sections.map((s) => s.text).join("\n");
    assert.match(all, /750 TL üzeri/);
    assert.match(all, /- Öğütülmüş kahve iade edilemez\./);
    assert.doesNotMatch(all, /Çerezleri|track\(\)|Ana sayfa|© 2026/);
    assert.equal(page.sections.find((s) => s.text.includes("14 gün"))?.heading, "İade koşulları");
    assert.ok(page.links.includes("https://kahve.example/iletisim"));
    assert.ok(page.links.includes("https://kahve.example/gizlilik"));
    assert.ok(!page.links.some((l) => l.startsWith("mailto:")));
    assert.equal(page.noindex, false);
  });

  const text = (html: string) => extractPage(`<html><body><main>${html}</main></body></html>`, "https://shop.example/faq").sections;
  const all = (html: string) => text(html).map((s) => s.text).join("\n");

  it("keeps collapsed accordion and tab panels with their questions", () => {
    const sections = text(`
      <h2>Shipping</h2>
      <h3><button aria-expanded="false" aria-controls="a1">How long does delivery take?<svg></svg></button></h3>
      <div id="a1" role="region" hidden>Orders arrive within 3-5 business days across Europe.</div>
      <h3><button aria-expanded="false" aria-controls="a2">Can I return an item?</button></h3>
      <div id="a2" aria-hidden="true">Returns are free within 30 days of delivery.</div>
      <div role="tablist"><button role="tab" aria-controls="t1">Care</button></div>
      <div id="t1" role="tabpanel" hidden>Wash the cover at 30 degrees.</div>
      <div hidden="until-found">Our phone line is open 9-18 on weekdays.</div>`);
    const delivery = sections.find((s) => s.text.includes("3-5 business days"));
    assert.equal(delivery?.heading, "How long does delivery take?");
    assert.equal(sections.find((s) => s.text.includes("30 days"))?.heading, "Can I return an item?");
    const body = sections.map((s) => s.text).join("\n");
    assert.match(body, /Care Wash the cover at 30 degrees\./);
    assert.match(body, /open 9-18 on weekdays/);
  });

  it("keeps the questions of accordions whose panels are open in the markup", () => {
    const sections = text(`<h2 class="accordion-header"><button class="accordion-button" aria-expanded="true" aria-controls="c1">Do you ship to Norway?</button></h2>
      <div id="c1" class="accordion-collapse collapse show">Yes, with a 10 € surcharge.</div>`);
    assert.equal(sections.find((s) => s.text.includes("10 €"))?.heading, "Do you ship to Norway?");
  });

  it("still drops hidden menus, dialogs, carousel clones, decorative text and plain buttons", () => {
    const body = all(`
      <p>Handmade mugs, glazed and fired in our studio in Izmir.</p>
      <button aria-expanded="false" aria-controls="m">Menu</button>
      <div id="m" hidden><a href="/a">Mugs</a> <a href="/b">Plates</a> <a href="/c">Bowls</a></div>
      <button aria-expanded="false" aria-controls="d">Size guide</button>
      <div id="d" role="dialog" hidden>Secret dialog text</div>
      <div role="tabpanel" class="slick-slide slick-cloned" aria-hidden="true">Cloned quote</div>
      <span aria-hidden="true">Decorative marquee</span>
      <div hidden>Something went wrong</div>
      <button>Add to cart</button>`);
    assert.match(body, /Handmade mugs/);
    assert.doesNotMatch(body, /Menu|Mugs|Plates|Size guide|Secret|Cloned|Decorative|went wrong|Add to cart/);
  });

  it("writes data tables one row per line, keyed by column header", () => {
    const body = all(`<table><caption>Plans</caption><thead><tr><th>Plan</th><th>Price</th><th>Replies</th></tr></thead>
      <tbody><tr><td>Starter</td><td>€19/month</td><td>1,000</td></tr><tr><td>Pro</td><td>€49/month</td><td></td></tr></tbody></table>
      <table><tr><th>Weight</th><td>2 kg</td></tr><tr><th>Colour</th><td>Blue</td></tr></table>
      <table><tr><td>A</td><td>B</td><td>C</td></tr></table>
      <dl><dt>Delivery</dt><dd>3-5 days</dd><dt>Returns</dt><dt>Exchanges</dt><dd>30 days</dd></dl>`);
    assert.match(body, /Plans\n- Plan: Starter; Price: €19\/month; Replies: 1,000\n- Plan: Pro; Price: €49\/month\n/);
    assert.match(body, /- Weight: 2 kg\n- Colour: Blue/);
    assert.match(body, /- A \| B \| C/);
    assert.match(body, /- Delivery: 3-5 days\n- Returns, Exchanges: 30 days/);
  });

  it("walks layout tables like any other container", () => {
    const sections = text(`<table><tr><td><h2>About us</h2><p>Family run since 1982.</p></td><td><h2>Visit</h2><p>Open Monday to Saturday.</p></td></tr></table>`);
    assert.equal(sections.find((s) => s.text.includes("1982"))?.heading, "About us");
    assert.equal(sections.find((s) => s.text.includes("Saturday"))?.heading, "Visit");
  });
});

describe("chunking", () => {
  it("keeps headings in titles and respects the size limit", () => {
    const chunks = chunkPage(extractPage(PAGE, "https://kahve.example/kargo"), 120);
    assert.ok(chunks.length >= 2);
    for (const c of chunks) {
      assert.equal(c.url, "https://kahve.example/kargo");
      assert.ok(c.text.length <= 160, c.text);
    }
    assert.ok(chunks.some((c) => c.title === "Kargo ve İade | Kahve Dükkanı – İade koşulları"));
  });

  it("splits long text at sentences and merges a tiny tail", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = packParagraphs(text, 200);
    assert.ok(chunks.every((c) => c.length <= 250));
    assert.equal(chunks.join(" ").replace(/\n/g, " "), text);
    assert.deepEqual(chunkText("Return policy", "Short.\n\nAlso short."), [{ url: "", title: "Return policy", text: "Short.\nAlso short." }]);
  });
});

describe("crawlSite", () => {
  const site: Record<string, string> = {
    "https://www.kahve.example/": `<title>Ana sayfa</title><main><h1>Hoş geldiniz</h1><p>Taze kavrulmuş kahveler, her hafta yeni çekirdekler ve abonelik seçenekleri.</p><a href="/kargo">Kargo</a><a href="/admin/panel">Panel</a><a href="https://kahve.example/hakkimizda?utm_source=x">Hakkımızda</a><a href="/menu.pdf">Menü</a></main>`,
    "https://www.kahve.example/kargo": PAGE,
    "https://kahve.example/hakkimizda": `<title>Hakkımızda</title><main><p>2015'ten beri İstanbul'da küçük partiler halinde kahve kavuruyoruz ve dünyaya gönderiyoruz.</p></main>`,
  };
  site["https://www.kahve.example/kopya"] = site["https://www.kahve.example/"];
  Object.assign(site, {
    "https://www.kahve.example/gizli": `<meta name="robots" content="noindex"><main><p>Bu sayfa arama motorlarına kapalı ama yeterince uzun bir metin içeriyor.</p></main>`,
  });
  const fetched: string[] = [];
  const fake: Fetcher = async (url) => {
    fetched.push(url);
    if (url === "https://kahve.example/") return { url: "https://www.kahve.example/", status: 200, contentType: "text/html", body: site["https://www.kahve.example/"] };
    if (url.endsWith("/robots.txt")) return { url, status: 200, contentType: "text/plain", body: "User-agent: *\nDisallow: /admin\nSitemap: https://www.kahve.example/sitemap.xml" };
    if (url.endsWith("/sitemap.xml")) {
      return {
        url,
        status: 200,
        contentType: "application/xml",
        body: "<urlset><url><loc>https://www.kahve.example/kopya</loc></url><url><loc>https://www.kahve.example/gizli</loc></url><url><loc>https://elsewhere.example/x</loc></url></urlset>",
      };
    }
    const body = site[url];
    if (!body) throw new FetchError("bad_status", "404");
    return { url, status: 200, contentType: "text/html", body };
  };

  it("reads same-site pages, follows the sitemap, honors robots and skips duplicates", async () => {
    const result = await crawlSite("kahve.example", { fetch: fake, maxPages: 10 });
    assert.equal(result.startUrl, "https://www.kahve.example/");
    const urls = result.pages.map((p) => p.url).sort();
    assert.deepEqual(urls, ["https://kahve.example/hakkimizda", "https://www.kahve.example/", "https://www.kahve.example/kargo"]);
    assert.ok(!fetched.some((u) => u.includes("/admin") || u.includes("elsewhere")));
    assert.ok(!fetched.some((u) => u.includes("utm_source")));
  });

  it("stops at the page limit", async () => {
    const result = await crawlSite("kahve.example", { fetch: fake, maxPages: 2 });
    assert.equal(result.pages.length, 2);
  });

  it("explains failures in plain words", async () => {
    await assert.rejects(crawlSite("not a url"), CrawlError);
    await assert.rejects(crawlSite("http://127.0.0.1"), /Private network/);
    const down: Fetcher = async () => {
      throw new FetchError("network", "The domain doesn't exist");
    };
    await assert.rejects(crawlSite("nope.example", { fetch: down }), /The domain doesn't exist/);
    assert.equal(normalizeStartUrl(" www.example.com/a#b "), "https://www.example.com/a");
  });

  it("produces chunks the retrieval index can rank", async () => {
    const result = await crawlSite("kahve.example", { fetch: fake });
    const kb = new KnowledgeBase();
    kb.load("t1", result.pages.flatMap((p) => chunkPage(p)));
    const [top] = kb.search("t1", [{ text: "iade kaç gün içinde yapılır?", weight: 1 }], 3);
    assert.match(top.chunk.text, /14 gün/);
  });
});
