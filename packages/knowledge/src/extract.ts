// Turns a web page into the text a visitor would read: the main content split by heading,
// without menus, footers, cookie banners, scripts or forms.
import { parse, type HTMLElement, type Node } from "node-html-parser";

export interface Section {
  /** Nearest h1–h3 above this text, if any. */
  heading: string;
  text: string;
}

export interface ExtractedPage {
  url: string;
  title: string;
  description: string;
  sections: Section[];
  /** Absolute http(s) links found anywhere on the page, without #fragments. */
  links: string[];
  /** <meta name="robots" content="noindex"> */
  noindex: boolean;
}

const DROP = "script, style, noscript, template, svg, iframe, canvas, video, audio, object, form, button, select, input, textarea, dialog";
const CHROME = "nav, aside, [role=navigation], [role=banner], [role=contentinfo], [role=dialog], [aria-hidden=true], [hidden]";
// class/id words that mark site chrome rather than content
const NOISE = /(^|[\s_-])(cookie|consent|gdpr|kvkk|banner|navbar|nav|menu|breadcrumbs?|footer|sidebar|popup|modal|newsletter|share|social|skip|offcanvas|drawer|toast)([\s_-]|$)/i;

const BLOCKS = new Set(["P", "LI", "DD", "DT", "TD", "TH", "BLOCKQUOTE", "PRE", "FIGCAPTION", "H4", "H5", "H6", "CAPTION", "SUMMARY"]);
const HEADINGS = new Set(["H1", "H2", "H3"]);
const CONTAINERS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN", "BODY", "UL", "OL", "DL", "TABLE", "THEAD", "TBODY", "TR", "DETAILS", "FIGURE", "SPAN", "CENTER"]);

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

function isNoise(el: HTMLElement): boolean {
  const marker = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
  return NOISE.test(marker);
}

function pickMain(body: HTMLElement): HTMLElement {
  const candidates = [body.querySelector("main"), body.querySelector("[role=main]"), body.querySelector("article")].filter(
    (el): el is HTMLElement => !!el && clean(el.text).length > 200,
  );
  return candidates[0] ?? body;
}

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false } });
  const base = (() => {
    const href = root.querySelector("base[href]")?.getAttribute("href");
    try {
      return href ? new URL(href, pageUrl).href : pageUrl;
    } catch {
      return pageUrl;
    }
  })();

  const meta = (name: string) =>
    root.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? root.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ?? "";

  const links = new Set<string>();
  for (const a of root.querySelectorAll("a[href]")) {
    const rel = (a.getAttribute("rel") ?? "").toLowerCase();
    if (rel.includes("nofollow")) continue;
    try {
      const url = new URL(a.getAttribute("href")!, base);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      links.add(url.href);
    } catch {}
  }

  const body = root.querySelector("body") ?? root;
  const h1 = clean(body.querySelector("h1")?.text ?? "");
  const title = clean(meta("og:title") || root.querySelector("title")?.text || h1 || new URL(pageUrl).hostname);

  for (const el of body.querySelectorAll(DROP)) el.remove();
  for (const el of body.querySelectorAll(CHROME)) el.remove();
  // the site header/footer is chrome, but an article's own header often holds its title
  for (const el of body.querySelectorAll("header, footer")) if (!el.parentNode?.closest?.("main, article")) el.remove();
  for (const el of body.querySelectorAll("[class], [id]")) {
    // don't drop the page's main wrapper just because it's called "content-menu" or similar
    if (isNoise(el) && clean(el.text).length < 1500) el.remove();
  }

  const sections: Section[] = [];
  let heading = "";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) sections.push({ heading, text });
    buffer = [];
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = clean(node.text);
      if (text) buffer.push(text);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (HEADINGS.has(tag)) {
      flush();
      heading = clean(el.text);
      return;
    }
    if (BLOCKS.has(tag)) {
      const text = tag === "PRE" ? el.text.trim() : clean(el.text);
      if (text) buffer.push(tag === "LI" ? `- ${text}` : text);
      return;
    }
    if (CONTAINERS.has(tag) || !tag) {
      for (const child of el.childNodes) walk(child);
      return;
    }
    // inline elements (a, b, em…) outside a block: keep their text
    const text = clean(el.text);
    if (text) buffer.push(text);
  };
  walk(pickMain(body));
  flush();

  const robots = meta("robots").toLowerCase();
  return {
    url: pageUrl,
    title,
    description: clean(meta("description") || meta("og:description")),
    sections: mergeTiny(sections),
    links: [...links],
    noindex: robots.includes("noindex"),
  };
}

/** Inline fragments become separate lines while walking; join runs of short ones back up. */
function mergeTiny(sections: Section[]): Section[] {
  return sections
    .map((s) => ({
      heading: s.heading,
      text: s.text
        .split("\n")
        .reduce<string[]>((lines, line) => {
          const last = lines[lines.length - 1];
          if (last !== undefined && !line.startsWith("- ") && last.length < 60 && !/[.!?:]$/.test(last)) lines[lines.length - 1] = `${last} ${line}`;
          else lines.push(line);
          return lines;
        }, [])
        .join("\n"),
    }))
    .filter((s) => s.text.length > 0);
}
