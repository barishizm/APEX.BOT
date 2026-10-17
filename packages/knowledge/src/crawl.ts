// Reads a customer's website: the start page, its sitemap and the same-site pages and documents
// (PDF, .docx) they link to, breadth first, within a page and time budget. robots.txt is respected.
import { createHash } from "node:crypto";
import { DOCUMENT_TYPES, documentKind, extractDocument, titleFromName } from "./documents.ts";
import { extractPage, type ExtractedPage } from "./extract.ts";
import { FetchError, checkUrl, safeFetch, type Fetcher } from "./net.ts";
import { allowAll, parseRobots, parseSitemap, type Robots } from "./robots.ts";

export interface CrawlOptions {
  /** Web pages and documents together. */
  maxPages?: number;
  /** Linked PDF and .docx files read, within maxPages. */
  maxDocuments?: number;
  /** Stop starting new requests after this long. */
  timeBudgetMs?: number;
  concurrency?: number;
  fetch?: Fetcher;
  allowPrivate?: boolean;
  onProgress?: (pagesRead: number) => void;
}

export interface CrawlResult {
  startUrl: string;
  pages: ExtractedPage[];
  /** Pages that failed or were empty; the crawl still succeeds. */
  failed: number;
}

export class CrawlError extends Error {}

const DOC_EXT = /\.(pdf|docx)$/i;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|zip|rar|7z|gz|tar|dmg|exe|msi|apk|mp[34]|m4a|wav|ogg|webm|mov|avi|css|js|mjs|json|xml|rss|atom|txt|csv|doc|xlsx?|pptx?|woff2?|ttf|eot)$/i;
const TRACKING = /^(utm_\w+|gclid|fbclid|msclkid|yclid|mc_cid|mc_eid|ref|_ga)$/i;
const MAX_QUEUE = 2000;

/** Accepts "example.com", "www.example.com/path" or a full URL; https unless stated. */
export function normalizeStartUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new CrawlError("Enter your website address");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CrawlError("That doesn't look like a website address");
  }
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) throw new CrawlError("That doesn't look like a website address");
  url.hash = "";
  return url.href;
}

const siteKey = (host: string) => host.toLowerCase().replace(/^www\./, "");

function canonical(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    if (url.href.length > 500) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function loadRobots(origin: string, fetcher: Fetcher, allowPrivate: boolean): Promise<Robots> {
  try {
    const res = await fetcher(`${origin}/robots.txt`, { accept: ["text/plain", "text/"], maxBytes: 500_000, timeoutMs: 8000, allowPrivate });
    return parseRobots(res.body);
  } catch {
    // missing or unreadable robots.txt means no restrictions
    return allowAll;
  }
}

async function loadSitemaps(urls: string[], fetcher: Fetcher, allowPrivate: boolean, limit: number): Promise<string[]> {
  const pages: string[] = [];
  const queue = [...urls];
  let fetched = 0;
  while (queue.length && fetched < 5 && pages.length < limit) {
    const url = queue.shift()!;
    fetched++;
    try {
      const res = await fetcher(url, { accept: ["application/xml", "text/xml", "text/plain", "application/x-xml"], maxBytes: 5_000_000, timeoutMs: 10_000, allowPrivate });
      const parsed = parseSitemap(res.body);
      pages.push(...parsed.pages);
      queue.push(...parsed.sitemaps);
    } catch {}
  }
  return pages.slice(0, limit);
}

export async function crawlSite(start: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 200;
  const maxDocuments = options.maxDocuments ?? 20;
  const deadline = Date.now() + (options.timeBudgetMs ?? 200_000);
  const concurrency = options.concurrency ?? 6;
  const fetcher = options.fetch ?? safeFetch;
  const allowPrivate = options.allowPrivate ?? false;

  const startUrl = normalizeStartUrl(start);
  try {
    checkUrl(startUrl, allowPrivate);
  } catch (err) {
    throw new CrawlError(err instanceof Error ? err.message : "This address can't be read");
  }

  // The start page decides the site: example.com may redirect to www.example.com
  let first;
  try {
    first = await fetcher(startUrl, { allowPrivate });
  } catch (err) {
    throw new CrawlError(err instanceof FetchError ? err.message : "Couldn't open the website");
  }
  const origin = new URL(first.url).origin;
  const site = siteKey(new URL(first.url).hostname);
  const robots = await loadRobots(origin, fetcher, allowPrivate);
  if (!robots.isAllowed(new URL(first.url).pathname)) throw new CrawlError("The site's robots.txt doesn't allow reading this page");

  const sameSite = (url: string) => {
    try {
      const u = new URL(url);
      return (u.protocol === "https:" || u.protocol === "http:") && siteKey(u.hostname) === site && !SKIP_EXT.test(u.pathname);
    } catch {
      return false;
    }
  };

  const seen = new Set<string>();
  const queue: string[] = [];
  let documents = 0;
  const enqueue = (raw: string) => {
    const url = canonical(raw);
    if (!url || seen.has(url) || !sameSite(url) || queue.length >= MAX_QUEUE) return;
    if (!robots.isAllowed(new URL(url).pathname + new URL(url).search)) return;
    const isDocument = DOC_EXT.test(new URL(url).pathname);
    if (isDocument && documents >= maxDocuments) return;
    if (isDocument) documents++;
    seen.add(url);
    queue.push(url);
  };

  const pages: ExtractedPage[] = [];
  const digests = new Set<string>();
  let failed = 0;

  const keep = (page: ExtractedPage) => {
    const text = page.sections.map((s) => s.text).join("\n");
    if (page.noindex || text.length < 40) return false;
    // the same content under two URLs (/, /index.html, ?lang=) is read once
    const digest = createHash("sha1").update(text).digest("hex");
    if (digests.has(digest)) return false;
    digests.add(digest);
    pages.push(page);
    options.onProgress?.(pages.length);
    return true;
  };
  const accept = (url: string, html: string) => {
    const page = extractPage(html, url);
    for (const link of page.links) enqueue(link);
    return keep(page);
  };
  const readDocument = async (url: string) => {
    const res = await fetcher(url, {
      accept: [...DOCUMENT_TYPES, "application/octet-stream", "binary/octet-stream", "text/html"],
      binary: true,
      maxBytes: 15_000_000,
      timeoutMs: 30_000,
      allowPrivate,
    });
    // a document may redirect to the site's file storage on another host; every hop is SSRF-checked
    const bytes = res.bytes ?? new TextEncoder().encode(res.body);
    const kind = documentKind(bytes, new URL(res.url).pathname);
    if (!kind) return false;
    return keep(await extractDocument(bytes, kind, res.url, titleFromName(new URL(res.url).pathname)));
  };

  seen.add(canonical(startUrl) ?? startUrl);
  seen.add(canonical(first.url) ?? first.url);
  if (!accept(first.url, first.body)) failed++;

  const sitemapUrls = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
  for (const url of await loadSitemaps(sitemapUrls, fetcher, allowPrivate, maxPages * 4)) enqueue(url);

  const worker = async () => {
    while (pages.length < maxPages && Date.now() < deadline) {
      const url = queue.shift();
      if (!url) return;
      try {
        if (DOC_EXT.test(new URL(url).pathname)) {
          if (!(await readDocument(url))) failed++;
          continue;
        }
        const res = await fetcher(url, { allowPrivate });
        if (!sameSite(res.url)) continue; // redirected off-site
        if (!accept(res.url, res.body)) failed++;
      } catch {
        failed++;
      }
    }
  };
  // Workers exit when the queue is momentarily empty; restart them while new links keep arriving
  while (queue.length && pages.length < maxPages && Date.now() < deadline) {
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  if (pages.length === 0) throw new CrawlError("No readable text was found on this website");
  return { startUrl: first.url, pages: pages.slice(0, maxPages), failed };
}
