// Serves the widget bundle at /widget.js. Customers embed that fixed URL, so it can't carry a version;
// instead it is cached for a few minutes (browsers and Cloudflare) and revalidated with an ETag, so a
// repeat page view costs a 304 rather than the whole bundle.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { Context } from "hono";

// Five minutes fresh, then served stale for up to a day while one revalidation runs in the background.
export const WIDGET_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

type Bundle = { mtimeMs: number; body: Buffer; etag: string };

// `cacheControl` defaults to WIDGET_CACHE_CONTROL; development passes "no-cache" so a rebuilt bundle
// shows up on the next reload (the ETag still turns unchanged reloads into 304s).
export function widgetHandler(path: string, cacheControl = WIDGET_CACHE_CONTROL) {
  let cached: Bundle | undefined;

  // Re-reads only when the file changes (a rebuild during `npm run dev`); in production it is read once.
  async function load(): Promise<Bundle | undefined> {
    const info = await stat(path).catch(() => undefined);
    if (!info) return undefined;
    if (cached?.mtimeMs !== info.mtimeMs) {
      const body = await readFile(path);
      const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
      cached = { mtimeMs: info.mtimeMs, body, etag };
    }
    return cached;
  }

  return async (c: Context) => {
    const bundle = await load();
    if (!bundle) return c.text("Widget not built. Run: npm run build -w @apex/widget", 404);
    const headers = {
      "Cache-Control": cacheControl,
      ETag: bundle.etag,
      "Access-Control-Allow-Origin": "*",
    };
    if (matches(c.req.header("if-none-match"), bundle.etag)) return c.body(null, 304, headers);
    return c.body(new Uint8Array(bundle.body), 200, { ...headers, "Content-Type": "text/javascript; charset=utf-8" });
  };
}

// If-None-Match may list several tags, use "*", or carry the weak prefix a proxy adds after compressing.
function matches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const t = tag.trim();
    return t === "*" || t.replace(/^W\//, "") === etag;
  });
}
