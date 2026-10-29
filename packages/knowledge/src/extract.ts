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

// Roles whose hidden content is UI, never an answer: menus, pickers, dialogs, tooltips
const NOT_PANEL_ROLE = /^(dialog|alertdialog|menu|menubar|listbox|tree|grid|navigation|tooltip|combobox)$/i;
const CLONE = /(^|[\s_-])cloned?([\s_-]|$)/i;

/** Most of the element's text sits inside links: a menu or a link list, not content. */
function linkDense(el: HTMLElement, text: string): boolean {
  const linked = el.querySelectorAll("a").reduce((n, a) => n + clean(a.text).length, 0);
  return linked > text.length / 2;
}

/**
 * Collapsed accordion and tab panels hold some of a site's most useful text (FAQ answers, a
 * product's "Shipping" tab), but a closed one carries `hidden` or `aria-hidden` and its question
 * sits in a <button>, both of which are otherwise dropped as chrome. A hidden element counts as a
 * panel only when the markup says so: hidden="until-found", role tabpanel/region, or the target
 * of a disclosure control (aria-controls on an element with aria-expanded or role=tab); collapsed
 * menus, dialogs, pickers and carousel clones never do. The controls returned are the <button>s
 * that open a panel: their text is the question or the tab's name.
 */
function disclosures(body: HTMLElement): { panels: Set<HTMLElement>; controls: Set<HTMLElement> } {
  const panels = new Set<HTMLElement>();
  const controls = new Set<HTMLElement>();
  const isPanel = (el: HTMLElement) => {
    if (panels.has(el)) return true;
    if (el.tagName === "DIALOG" || el.tagName === "NAV" || NOT_PANEL_ROLE.test(el.getAttribute("role") ?? "") || CLONE.test(el.getAttribute("class") ?? "")) return false;
    const text = clean(el.text);
    if (!text || linkDense(el, text)) return false;
    panels.add(el);
    return true;
  };
  for (const el of body.querySelectorAll('[hidden="until-found"], [role=tabpanel], [role=region]')) isPanel(el);
  const byId = new Map<string, HTMLElement>();
  for (const el of body.querySelectorAll("[id]")) if (!byId.has(el.id)) byId.set(el.id, el);
  for (const control of body.querySelectorAll("[aria-controls]")) {
    if (!control.hasAttribute("aria-expanded") && control.getAttribute("role")?.toLowerCase() !== "tab") continue;
    let opens = false;
    for (const id of (control.getAttribute("aria-controls") ?? "").split(/\s+/)) {
      const target = id && byId.get(id);
      if (target && isPanel(target)) opens = true;
    }
    if (opens && control.tagName === "BUTTON") controls.add(control);
  }
  return { panels, controls };
}

/**
 * A data table as one line per row, each cell keyed by its column header ("- Plan: Pro; Price:
 * €49"), so a price stays with its plan in a chunk and in the model's reading; flattened, a
 * pricing table is a run of words. Returns null for a layout table (headings, nested tables or
 * long text in its cells), which is walked like any other container.
 */
function tableLines(table: HTMLElement): string[] | null {
  if (table.querySelector("table, h1, h2, h3, h4, h5, h6, ul, ol, dl, p + p")) return null;
  const rows = table
    .querySelectorAll("tr")
    .map((tr) => tr.childNodes.filter((n): n is HTMLElement => n.nodeType === 1 && ((n as HTMLElement).tagName === "TD" || (n as HTMLElement).tagName === "TH")))
    .filter((cells) => cells.length > 0);
  if (rows.length === 0 || rows.some((cells) => cells.some((cell) => clean(cell.text).length > 400))) return null;
  const texts = rows.map((cells) => cells.map((cell) => clean(cell.text)));
  const lines: string[] = [];
  const caption = clean(table.querySelector("caption")?.text ?? "");
  if (caption) lines.push(caption);
  // a first row of <th>s (or the <thead>'s) names the columns
  const first = rows[0];
  const headed = rows.length > 1 && (first.every((cell) => cell.tagName === "TH") || first[0].parentNode?.parentNode?.tagName === "THEAD");
  const header = headed ? texts[0] : null;
  for (const cells of headed ? texts.slice(1) : texts) {
    if (!cells.some(Boolean)) continue;
    let line: string;
    if (header && header.length === cells.length) {
      line = cells.flatMap((value, i) => (!value ? [] : header[i] ? [`${header[i]}: ${value}`] : [value])).join("; ");
    } else if (cells.length === 2 && cells[0] && cells[1]) {
      // a two-column table without headers is a list of name/value pairs ("Weight | 2 kg")
      line = `${cells[0]}: ${cells[1]}`;
    } else {
      line = cells.filter(Boolean).join(" | ");
    }
    lines.push(`- ${line}`);
  }
  return lines;
}

/** A definition list as "- term: description" lines; null when it nests another list. */
function definitionLines(dl: HTMLElement): string[] | null {
  if (dl.querySelector("dl")) return null;
  const lines: string[] = [];
  let terms: string[] = [];
  let described = false;
  for (const el of dl.querySelectorAll("dt, dd")) {
    const text = clean(el.text);
    if (!text) continue;
    if (el.tagName === "DT") {
      // a run of <dt>s shares the <dd>s that follow it
      if (described) terms = [];
      described = false;
      terms.push(text);
      continue;
    }
    described = true;
    lines.push(terms.length ? `- ${terms.join(", ")}: ${text}` : text);
  }
  if (!described && terms.length) lines.push(...terms.map((t) => `- ${t}`));
  return lines;
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

  const { panels, controls } = disclosures(body);
  for (const el of body.querySelectorAll(DROP)) if (!controls.has(el)) el.remove();
  for (const el of body.querySelectorAll(CHROME)) if (!panels.has(el)) el.remove();
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
    const lines = tag === "TABLE" ? tableLines(el) : tag === "DL" ? definitionLines(el) : null;
    if (lines) {
      buffer.push(...lines);
      return;
    }
    // a layout table's cell holds whole sections, headings included
    const layoutCell = (tag === "TD" || tag === "TH") && !!el.querySelector("h1, h2, h3, p, ul, ol, dl, div, table");
    if (BLOCKS.has(tag) && !layoutCell) {
      const text = tag === "PRE" ? el.text.trim() : clean(el.text);
      if (text) buffer.push(tag === "LI" ? `- ${text}` : text);
      return;
    }
    if (CONTAINERS.has(tag) || layoutCell || !tag) {
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
