// Where a conversation started, shown in the dashboard inbox: the page and its title, the
// browser's language and the country of its time zone (sent by the widget), and the kind of
// device (read from the User-Agent). All of it is a hint; none of it identifies the visitor.
import { countryOfTimeZone } from "./timezones.ts";

export interface VisitorContext {
  /** Path of the page the widget ran on, without query string or fragment (they can hold tokens or emails). */
  page?: string;
  pageTitle?: string;
  /** BCP 47 tag of the browser's language, e.g. "tr-TR". */
  locale?: string;
  /** ISO 3166 code of the country the browser's time zone is in. */
  country?: string;
  device?: "mobile" | "tablet" | "desktop";
  os?: string;
  browser?: string;
}

const CONTROL = /[\u0000-\u001f\u007f]/g;
const LOCALE = /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$/i;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(CONTROL, "").trim().slice(0, max) : "";
}

/** Only a path: an absolute URL or one with a query keeps just its path. */
function pagePath(value: unknown): string {
  const raw = clean(value, 2000);
  if (!raw) return "";
  try {
    return new URL(raw, "https://x.invalid").pathname.slice(0, 300);
  } catch {
    return "";
  }
}

const OS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

// order matters: most browsers also claim to be Chrome and Safari
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/YaBrowser/, "Yandex"],
  [/Firefox|FxiOS/, "Firefox"],
  [/Chrome|CriOS/, "Chrome"],
  [/Safari/, "Safari"],
];

export function parseUserAgent(ua: string | undefined): Pick<VisitorContext, "device" | "os" | "browser"> {
  if (!ua) return {};
  const device = /iPad|Tablet|Android(?!.*Mobile)/.test(ua) ? "tablet" : /Mobi|iPhone|iPod|Android/.test(ua) ? "mobile" : "desktop";
  const os = OS.find(([re]) => re.test(ua))?.[1];
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  return { device, ...(os ? { os } : {}), ...(browser ? { browser } : {}) };
}

/** The widget's `context` field, checked and trimmed, plus what the User-Agent tells. */
export function visitorContext(raw: unknown, userAgent: string | undefined): VisitorContext {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const page = pagePath(body.page);
  const pageTitle = clean(body.title, 200);
  const locale = clean(body.locale, 35);
  const country = countryOfTimeZone(clean(body.timeZone, 64));
  return {
    ...(page ? { page } : {}),
    ...(pageTitle ? { pageTitle } : {}),
    ...(LOCALE.test(locale) ? { locale } : {}),
    ...(country ? { country } : {}),
    ...parseUserAgent(userAgent),
  };
}
