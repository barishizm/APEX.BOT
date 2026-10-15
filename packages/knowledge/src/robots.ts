// robots.txt (RFC 9309, the parts that matter for a polite crawler) and sitemap parsing.

export interface Robots {
  isAllowed(path: string): boolean;
  sitemaps: string[];
}

interface Rule {
  allow: boolean;
  /** literal pieces of the rule between "*" wildcards */
  parts: string[];
  anchored: boolean;
  length: number;
}

const AGENT = "apexbot";

// Rules come from a customer-controlled site, so they are matched without a regex:
// a wildcard regex like /*a*a*a*b backtracks exponentially.
function compileRule(path: string, allow: boolean): Rule {
  const anchored = path.endsWith("$");
  return { allow, parts: (anchored ? path.slice(0, -1) : path).split("*"), anchored, length: path.length };
}

function matches(rule: Rule, path: string): boolean {
  const { parts, anchored } = rule;
  const first = parts[0];
  if (!path.startsWith(first)) return false;
  if (parts.length === 1) return anchored ? path.length === first.length : true;
  let pos = first.length;
  const last = parts.length - 1;
  // the leftmost match of each middle piece leaves the most room for the rest
  for (let i = 1; i < last; i++) {
    if (!parts[i]) continue;
    const at = path.indexOf(parts[i], pos);
    if (at < 0) return false;
    pos = at + parts[i].length;
  }
  const tail = parts[last];
  if (anchored) return path.length - pos >= tail.length && path.endsWith(tail);
  return tail ? path.indexOf(tail, pos) >= 0 : true;
}

export function parseRobots(text: string): Robots {
  const sitemaps: string[] = [];
  // groups: the agents a block names, then its rules
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (key !== "allow" && key !== "disallow")) continue;
    // "Disallow:" with no path allows everything
    if (!value) continue;
    current.rules.push(compileRule(value, key === "allow"));
  }

  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && AGENT.startsWith(a)));
  const rules = (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);

  return {
    sitemaps,
    isAllowed(path: string) {
      if (path === "/robots.txt") return true;
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!matches(rule, path)) continue;
        // most specific rule wins; on a tie, allow
        if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
      }
      return best ? best.allow : true;
    },
  };
}

export const allowAll: Robots = { sitemaps: [], isAllowed: () => true };

/** Page and child-sitemap URLs from a sitemap or sitemap index. */
export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  // plain scans for <loc>...</loc>; a single regex with adjacent \s* groups is quadratic on padded input
  const locs: string[] = [];
  const open = /<loc>/gi;
  const close = /<\/loc>/gi;
  for (let m = open.exec(xml); m; m = open.exec(xml)) {
    close.lastIndex = open.lastIndex;
    const end = close.exec(xml);
    if (!end) break;
    let value = xml.slice(open.lastIndex, end.index).trim();
    if (value.startsWith("<![CDATA[") && value.endsWith("]]>")) value = value.slice(9, -3).trim();
    open.lastIndex = end.index + end[0].length;
    if (value && !/[\s<\]]/.test(value)) locs.push(value.replace(/&amp;/g, "&"));
  }
  return /<sitemapindex[\s>]/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}
