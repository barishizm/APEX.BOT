// The small Markdown subset the assistant is told to use: paragraphs, lists, bold,
// italics, inline code and links. Output is built as DOM nodes, never innerHTML, so
// model text can't inject markup into the host page.

export type Inline = { t: "text" | "b" | "i" | "code"; v: string } | { t: "a"; v: string; href: string };
export type Block = { t: "p"; c: Inline[] } | { t: "ul" | "ol"; items: Inline[][] };

const INLINE =
  /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|(https?:\/\/[^\s<>()]+[^\s<>().,!?:;'"])/g;

function safeHref(href: string): string | null {
  return /^(https?:|mailto:)/i.test(href) ? href : null;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (node: Inline) => {
    const prev = out[out.length - 1];
    if (node.t === "text" && prev?.t === "text") prev.v += node.v;
    else out.push(node);
  };
  for (const m of src.matchAll(INLINE)) {
    if (m.index! > last) push({ t: "text", v: src.slice(last, m.index) });
    last = m.index! + m[0].length;
    if (m[1] !== undefined) push({ t: "b", v: m[1] });
    else if (m[2] !== undefined) push({ t: "code", v: m[2] });
    else if (m[3] !== undefined) {
      const href = safeHref(m[4]);
      push(href ? { t: "a", v: m[3], href } : { t: "text", v: m[3] });
    } else if (m[5] !== undefined) push({ t: "i", v: m[5] });
    else push({ t: "a", v: m[6], href: m[6] });
  }
  if (last < src.length) push({ t: "text", v: src.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; items: Inline[][]; raw: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join("\n")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.t, items: list.raw.map(parseInline) });
    list = null;
  };

  for (const line of src.split("\n")) {
    const item = /^\s*(?:([-*•])|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      const t = item[1] ? "ul" : "ol";
      if (!list || list.t !== t) {
        flushList();
        list = { t, items: [], raw: [] };
      }
      list.raw.push(item[2]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.raw[list.raw.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      // Headings aren't part of the subset; keep their text as a paragraph.
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushPara();
  flushList();
  return blocks;
}

function renderInline(nodes: Inline[], doc: Document): DocumentFragment {
  const frag = doc.createDocumentFragment();
  for (const n of nodes) {
    if (n.t === "text") {
      frag.append(n.v);
      continue;
    }
    const el = doc.createElement(n.t === "b" ? "strong" : n.t === "i" ? "em" : n.t);
    el.textContent = n.v;
    if (n.t === "a") {
      el.setAttribute("href", n.href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
    frag.append(el);
  }
  return frag;
}

export function renderMarkdown(src: string, doc: Document = document): DocumentFragment {
  const frag = doc.createDocumentFragment();
  for (const block of parseMarkdown(src)) {
    if (block.t === "p") {
      const p = doc.createElement("p");
      p.append(renderInline(block.c, doc));
      frag.append(p);
    } else {
      const list = doc.createElement(block.t);
      for (const item of block.items) {
        const li = doc.createElement("li");
        li.append(renderInline(item, doc));
        list.append(li);
      }
      frag.append(list);
    }
  }
  return frag;
}
