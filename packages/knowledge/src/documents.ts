// Turns PDF and Word (.docx) files into the same shape as a web page, so they are chunked and
// searched like one. Used for documents a crawled site links to and for files a customer uploads.
import { strFromU8, unzipSync } from "fflate";
import { getDocumentProxy } from "unpdf";
import type { ExtractedPage, Section } from "./extract.ts";

export type DocumentKind = "pdf" | "docx";

export const DOCUMENT_LIMITS = {
  /** Pages of one PDF that are read; the rest is ignored. */
  pdfPages: 300,
  /** Unpacked size of a .docx's text part, so a zip bomb stops here. */
  docxXmlBytes: 30_000_000,
} as const;

export class DocumentError extends Error {}

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOCUMENT_TYPES = ["application/pdf", DOCX_TYPE] as const;

/** By content (magic bytes), then by name or content type. Null for anything else. */
export function documentKind(bytes: Uint8Array, nameOrType = ""): DocumentKind | null {
  const head = String.fromCharCode(...bytes.subarray(0, 5));
  if (head === "%PDF-") return "pdf";
  // a .docx is a zip; an .xlsx or .pptx is too, so the name or type has to agree
  if (head.startsWith("PK\x03\x04") && (/\.docx$/i.test(nameOrType) || nameOrType.startsWith(DOCX_TYPE))) return "docx";
  return null;
}

const clean = (text: string) => text.replace(/[ \t ]+/g, " ").trim();

async function readPdf(bytes: Uint8Array): Promise<{ title: string; sections: Section[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { useSystemFonts: false, enableXfa: false, verbosity: 0 });
  try {
    const info = ((await pdf.getMetadata().catch(() => null))?.info ?? {}) as { Title?: unknown };
    const sections: Section[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, DOCUMENT_LIMITS.pdfPages); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        if (item.hasEOL) text += "\n";
        else if (item.str && !/\s$/.test(item.str)) text += " ";
      }
      page.cleanup();
      const lines = text
        .split("\n")
        .map(clean)
        .filter(Boolean)
        // page numbers alone on a line are noise
        .filter((l) => !/^\d{1,4}$/.test(l));
      if (lines.length) sections.push({ heading: "", text: joinWrappedLines(lines) });
    }
    return { title: typeof info.Title === "string" ? clean(info.Title) : "", sections };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** PDF lines break where the page is narrow, not where a sentence ends; join those back up. */
function joinWrappedLines(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    const startsItem = /^([-•▪●*]|\d+[.)])\s/.test(line);
    if (last !== undefined && !startsItem && !/[.!?:;]$/.test(last) && /^[\p{Ll}\d(]/u.test(line)) {
      out[out.length - 1] = last.endsWith("-") ? `${last.slice(0, -1)}${line}` : `${last} ${line}`;
    } else out.push(line);
  }
  return out.join("\n");
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? m),
  );

function readDocx(bytes: Uint8Array): { title: string; sections: Section[] } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => (f.name === "word/document.xml" || f.name === "docProps/core.xml") && f.originalSize <= DOCUMENT_LIMITS.docxXmlBytes,
    });
  } catch {
    throw new DocumentError("This Word file can't be opened");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new DocumentError("This Word file can't be opened");
  const body = strFromU8(xml);
  const core = files["docProps/core.xml"] ? strFromU8(files["docProps/core.xml"]) : "";
  const title = clean(decodeXml(/<dc:title>([^<]*)<\/dc:title>/.exec(core)?.[1] ?? ""));

  const sections: Section[] = [];
  let heading = "";
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) sections.push({ heading, text: buffer.join("\n") });
    buffer = [];
  };
  for (const [, inner] of body.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
    const text = clean(
      decodeXml(
        inner
          // tabs and line breaks sit outside <w:t>, so they become text runs of their own
          .replace(/<w:tab\/>/g, "\u0000 \u0000")
          .replace(/<w:br\/>/g, "\u0000\n\u0000")
          .replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, "\u0000$1\u0000")
          .split("\u0000")
          .filter((_, i) => i % 2 === 1)
          .join(""),
      ),
    );
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(inner)?.[1] ?? "";
    if (/^(Heading[1-3]|Title|Başlık[1-3]?)$/i.test(style)) {
      flush();
      heading = text;
    } else buffer.push(/<w:numPr>/.test(inner) ? `- ${text}` : text);
  }
  flush();
  return { title, sections };
}

/**
 * Reads a document's text. `url` is where it came from (the page cited in answers); for an upload,
 * pass "" and the file name as `fallbackTitle`.
 */
export async function extractDocument(bytes: Uint8Array, kind: DocumentKind, url: string, fallbackTitle: string): Promise<ExtractedPage> {
  let read;
  try {
    read = kind === "pdf" ? await readPdf(bytes) : readDocx(bytes);
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw new DocumentError(kind === "pdf" ? "This PDF can't be opened" : "This Word file can't be opened");
  }
  return { url, title: read.title || fallbackTitle, description: "", sections: read.sections, links: [], noindex: false };
}

/** A file name or URL path as a readable title: "iade-politikasi_2026.pdf" → "iade politikasi 2026". */
export function titleFromName(name: string): string {
  let base = name.split(/[/?#]/).filter(Boolean).pop() ?? name;
  try {
    base = decodeURIComponent(base);
  } catch {}
  return clean(base.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ")) || name;
}
