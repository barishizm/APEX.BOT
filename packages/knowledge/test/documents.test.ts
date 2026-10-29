import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import { DocumentError, chunkPage, crawlSite, documentKind, extractDocument, titleFromName, type Fetcher } from "../src/index.ts";

/** A one-font PDF with one line of text per page; offsets in the xref table are computed. */
export function makePdf(pages: string[][], title = ""): Uint8Array {
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  pages.forEach((lines, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  if (title) objects.push(`<< /Title (${title}) >>`);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${title ? ` /Info ${objects.length} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(out);
}

export function makeDocx(paragraphs: { text: string; style?: string; list?: boolean }[], title = ""): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = paragraphs
    .map(
      (p) =>
        `<w:p>${p.style || p.list ? `<w:pPr>${p.style ? `<w:pStyle w:val="${p.style}"/>` : ""}${p.list ? "<w:numPr><w:numId w:val=\"1\"/></w:numPr>" : ""}</w:pPr>` : ""}` +
        p.text
          .split("\t")
          .map((t) => `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`)
          .join("<w:r><w:tab/></w:r>") +
        `</w:p>`,
    )
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`),
    "docProps/core.xml": strToU8(`<cp:coreProperties><dc:title>${esc(title)}</dc:title></cp:coreProperties>`),
  });
}

describe("document extraction limits", () => {
  it("reads a .docx full of unclosed paragraph tags in linear time", async () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${"<w:p ".repeat(60_000)}</w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(xml), "docProps/core.xml": strToU8("<cp:coreProperties/>") });
    const started = Date.now();
    const page = await extractDocument(docx, "docx", "", "x");
    assert.deepEqual(page.sections, []);
    assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  });

  it("still finds paragraphs next to look-alike tags", async () => {
    const xml = `<w:document><w:body><w:pPr/><w:p><w:r><w:t>one</w:t></w:r></w:p><w:p w:rsid="1"><w:r><w:t>two</w:t></w:r></w:p></w:body></w:document>`;
    const docx = zipSync({ "word/document.xml": strToU8(xml) });
    const page = await extractDocument(docx, "docx", "", "x");
    assert.equal(page.sections[0].text, "one\ntwo");
  });
});

describe("documents", () => {
  it("tells documents apart by content, not just by name", () => {
    assert.equal(documentKind(makePdf([["x"]]), "anything.bin"), "pdf");
    assert.equal(documentKind(makeDocx([{ text: "x" }]), "a.docx"), "docx");
    // an .xlsx is a zip too
    assert.equal(documentKind(makeDocx([{ text: "x" }]), "a.xlsx"), null);
    assert.equal(documentKind(strToU8("<html>"), "a.pdf"), null);
  });

  it("reads a PDF's text page by page, with its title", async () => {
    const pdf = makePdf([["Return policy", "Unopened bags can be returned", "within 14 days of delivery."], ["Shipping takes 2 days."]], "Store terms");
    const page = await extractDocument(pdf, "pdf", "https://shop.example/terms.pdf", "terms");
    assert.equal(page.title, "Store terms");
    assert.equal(page.sections.length, 2);
    // a line wrapped mid-sentence is joined back up
    assert.match(page.sections[0].text, /Unopened bags can be returned within 14 days of delivery\./);
    assert.match(page.sections[1].text, /Shipping takes 2 days/);
    assert.equal(chunkPage(page)[0].url, "https://shop.example/terms.pdf");
  });

  it("reads a Word file's paragraphs under their headings", async () => {
    const docx = makeDocx(
      [
        { text: "Returns", style: "Heading1" },
        { text: "Unopened bags can be returned within 14 days." },
        { text: "Ground coffee", list: true },
        { text: "Price\t12 € & up" },
      ],
      "Policies",
    );
    const page = await extractDocument(docx, "docx", "", "fallback");
    assert.equal(page.title, "Policies");
    assert.deepEqual(page.sections, [{ heading: "Returns", text: "Unopened bags can be returned within 14 days.\n- Ground coffee\nPrice 12 € & up" }]);
  });

  it("refuses broken files in plain words", async () => {
    await assert.rejects(extractDocument(strToU8("%PDF-1.4 garbage"), "pdf", "", "x"), DocumentError);
    await assert.rejects(extractDocument(strToU8("PK\x03\x04garbage"), "docx", "", "x"), /Word file can't be opened/);
  });

  it("names a file after its name", () => {
    assert.equal(titleFromName("/files/iade-politikasi_2026.pdf"), "iade politikasi 2026");
    assert.equal(titleFromName("Fiyat%20listesi.docx"), "Fiyat listesi");
  });

  it("the crawler reads documents the site links to, within their own limit", async () => {
    const html = (body: string) => `<main><p>Taze kavrulmuş kahveler, her hafta yeni çekirdekler ve abonelik seçenekleri.</p>${body}</main>`;
    const fake: Fetcher = async (url, opts) => {
      if (url.endsWith("/robots.txt") || url.endsWith("/sitemap.xml")) throw new Error("404");
      if (url === "https://kahve.example/") return { url, status: 200, contentType: "text/html", body: html('<a href="/menu.pdf">Menü</a><a href="/a.docx">A</a><a href="/b.pdf">B</a>') };
      assert.equal(opts?.binary, true, url);
      if (url.endsWith("/menu.pdf")) return { url, status: 200, contentType: "application/pdf", body: "", bytes: makePdf([["Filtre kahve 90 TL, latte 120 TL, soğuk demleme 130 TL."]]) };
      if (url.endsWith("/a.docx")) return { url, status: 200, contentType: "application/octet-stream", body: "", bytes: makeDocx([{ text: "Toptan siparişler ve kafe anlaşmaları için bize e-posta ile yazın." }]) };
      throw new Error(`unexpected ${url}`);
    };
    const result = await crawlSite("kahve.example", { fetch: fake, maxDocuments: 2 });
    const byUrl = Object.fromEntries(result.pages.map((p) => [p.url, p]));
    assert.deepEqual(Object.keys(byUrl).sort(), ["https://kahve.example/", "https://kahve.example/a.docx", "https://kahve.example/menu.pdf"]);
    assert.equal(byUrl["https://kahve.example/menu.pdf"].title, "menu");
    assert.match(byUrl["https://kahve.example/a.docx"].sections[0].text, /Toptan/);
  });
});
