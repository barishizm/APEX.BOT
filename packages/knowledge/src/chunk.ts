// Splits content into retrieval chunks of roughly 150–400 tokens. Each chunk keeps its page
// title and section heading, so a match on "İade" in a heading still finds the paragraph.
import type { ExtractedPage } from "./extract.ts";
import type { ChunkInput } from "./retrieval.ts";

export const CHUNK_CHARS = 1400;
const MIN_CHARS = 200;

function splitLong(paragraph: string, max: number): string[] {
  if (paragraph.length <= max) return [paragraph];
  const out: string[] = [];
  let current = "";
  // sentence boundaries first, then hard cuts for run-on text
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > max) {
      if (current) out.push(current);
      current = "";
      for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max));
      continue;
    }
    if (current && current.length + sentence.length + 1 > max) {
      out.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) out.push(current);
  return out;
}

/** Packs paragraphs into chunks; small trailing pieces join the previous chunk. */
export function packParagraphs(text: string, max = CHUNK_CHARS): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitLong(p, max));
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length + 1 > max) {
      chunks.push(current);
      current = p;
    } else current = current ? `${current}\n${p}` : p;
  }
  if (current) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && current.length < MIN_CHARS && last.length + current.length + 1 <= max * 1.25) chunks[chunks.length - 1] = `${last}\n${current}`;
    else chunks.push(current);
  }
  return chunks;
}

const sectionTitle = (pageTitle: string, heading: string) =>
  heading && !pageTitle.toLowerCase().includes(heading.toLowerCase()) ? `${pageTitle} – ${heading}` : pageTitle;

export function chunkPage(page: ExtractedPage, max = CHUNK_CHARS): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  // Neighbouring short sections under different headings are merged, keeping the first heading
  let pending: { heading: string; text: string } | null = null;
  const emit = (heading: string, text: string) => {
    for (const piece of packParagraphs(text, max)) chunks.push({ url: page.url, title: sectionTitle(page.title, heading), text: piece });
  };
  for (const section of page.sections) {
    const text = section.heading ? `${section.heading}\n${section.text}` : section.text;
    if (pending && pending.text.length + text.length + 1 <= max) {
      pending.text += `\n${text}`;
      continue;
    }
    if (pending) emit(pending.heading, pending.text);
    pending = { heading: section.heading, text };
  }
  if (pending) emit(pending.heading, pending.text);
  if (page.description && chunks.length > 0 && !chunks[0].text.includes(page.description)) {
    chunks[0] = { ...chunks[0], text: `${page.description}\n${chunks[0].text}` };
  }
  return chunks;
}

/** A pasted text source: no URL, so answers cite it by title only. */
export function chunkText(title: string, content: string, max = CHUNK_CHARS): ChunkInput[] {
  return packParagraphs(content.replace(/\r\n/g, "\n"), max).map((text) => ({ url: "", title, text }));
}
