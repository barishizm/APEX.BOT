// HTTP fetching for the crawler. Customers type the URL, so every request is treated as
// hostile input: only http(s) on standard ports, only public IP addresses (checked on the
// address actually connected to, so DNS rebinding can't slip past), capped size and time.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";

export const USER_AGENT = "ApexBot/1.0 (+https://www.apexbot.eu/docs#knowledge)";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True only for addresses on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return !blocked.check(ip, "ipv4");
  if (version !== 6) return false;
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) inherits the IPv4 verdict; any other ::ffff: form is refused
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  if (lower.startsWith("::ffff:")) return false;
  return !blocked.check(ip, "ipv6");
}

export class FetchError extends Error {
  constructor(
    readonly code: "blocked" | "timeout" | "too_large" | "bad_status" | "bad_type" | "network" | "redirects",
    message: string,
  ) {
    super(message);
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Content types accepted, by prefix (e.g. "text/html"). */
  accept?: string[];
  /** Tests and local development only: allow private addresses and any port. */
  allowPrivate?: boolean;
  /** Keep the body as bytes (`bytes`) instead of decoding it to text. */
  binary?: boolean;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** Only with `binary`. */
  bytes?: Uint8Array;
}

export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchedPage>;

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const list = addresses as LookupAddress[];
      // One private answer is enough to refuse: the attacker controls which one we'd get
      if (!allowPrivate && (list.length === 0 || list.some((a) => !isPublicAddress(a.address)))) {
        return callback(Object.assign(new Error(`${hostname} resolves to a private address`), { code: "EBLOCKED" }), "");
      }
      if (options.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

/** Checks a URL before any network access; throws FetchError("blocked") when it can't be fetched. */
export function checkUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("blocked", "Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("blocked", "Only http and https URLs can be read");
  if (url.username || url.password) throw new FetchError("blocked", "URLs with credentials can't be read");
  if (!allowPrivate) {
    if (url.port && url.port !== "80" && url.port !== "443") throw new FetchError("blocked", "Only standard ports (80, 443) can be read");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPublicAddress(host)) throw new FetchError("blocked", "Private network addresses can't be read");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new FetchError("blocked", "Local hostnames can't be read");
    }
  }
  return url;
}

function charsetOf(contentType: string, head: Buffer): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.toString("latin1"))?.[1];
  const charset = (fromHeader || fromMeta || "utf-8").toLowerCase();
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

function requestOnce(url: URL, options: Required<FetchOptions>, signal: AbortSignal): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        signal,
        lookup: guardedLookup(options.allowPrivate) as never,
        headers: {
          "user-agent": USER_AGENT,
          accept: `${options.accept.join(", ")};q=1, */*;q=0.1`,
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "tr, en;q=0.9",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // Redirect bodies are irrelevant
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const parts: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          // decompressed size counts, so a zip bomb stops here too
          if (size > options.maxBytes) {
            req.destroy();
            reject(new FetchError("too_large", "The page is too large"));
            return;
          }
          parts.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(parts) }));
        stream.on("error", (err) => reject(err));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** GET with redirects (each hop re-checked), size and time limits, decoded to text. */
export const safeFetch: Fetcher = async (raw, opts = {}) => {
  const options: Required<FetchOptions> = {
    timeoutMs: opts.timeoutMs ?? 10_000,
    maxBytes: opts.maxBytes ?? 3_000_000,
    accept: opts.accept ?? ["text/html", "application/xhtml+xml"],
    allowPrivate: opts.allowPrivate ?? false,
    binary: opts.binary ?? false,
  };
  const signal = AbortSignal.timeout(options.timeoutMs);
  let url = checkUrl(raw, options.allowPrivate);
  for (let hop = 0; hop <= 5; hop++) {
    let res;
    try {
      res = await requestOnce(url, options, signal);
    } catch (err) {
      if (err instanceof FetchError) throw err;
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EBLOCKED") throw new FetchError("blocked", "This address points to a private network");
      if (signal.aborted || e.name === "AbortError" || e.name === "TimeoutError") throw new FetchError("timeout", "The site took too long to respond");
      throw new FetchError("network", e.code === "ENOTFOUND" ? "The domain doesn't exist" : "Couldn't connect to the site");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      if (!location) throw new FetchError("bad_status", `Redirect without a location (${res.status})`);
      url = checkUrl(new URL(location, url).href, options.allowPrivate);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new FetchError("bad_status", `The site answered with HTTP ${res.status}`);
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (contentType && !options.accept.some((a) => contentType.startsWith(a))) {
      throw new FetchError("bad_type", `Not a web page (${contentType.split(";")[0]})`);
    }
    if (options.binary) return { url: url.href, status: res.status, contentType, body: "", bytes: new Uint8Array(res.body) };
    const body = new TextDecoder(charsetOf(contentType, res.body.subarray(0, 2048))).decode(res.body);
    return { url: url.href, status: res.status, contentType, body };
  }
  throw new FetchError("redirects", "Too many redirects");
};
