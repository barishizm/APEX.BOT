import assert from "node:assert/strict";
import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { WIDGET_CACHE_CONTROL, widgetHandler } from "../src/widget-bundle.ts";

async function setup() {
  const file = join(await mkdtemp(join(tmpdir(), "widget-")), "widget.js");
  await writeFile(file, "console.log(1)");
  const app = new Hono();
  app.get("/widget.js", widgetHandler(file));
  return { app, file };
}

describe("/widget.js", () => {
  it("is cacheable and carries an ETag", async () => {
    const { app } = await setup();
    const res = await app.request("/widget.js");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), WIDGET_CACHE_CONTROL);
    assert.match(res.headers.get("etag") ?? "", /^"[\w-]+"$/);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(await res.text(), "console.log(1)");
  });

  it("answers a matching If-None-Match with an empty 304, weak or not", async () => {
    const { app } = await setup();
    const etag = (await app.request("/widget.js")).headers.get("etag")!;
    for (const tag of [etag, `W/${etag}`, `"other", ${etag}`]) {
      const res = await app.request("/widget.js", { headers: { "if-none-match": tag } });
      assert.equal(res.status, 304, tag);
      assert.equal(res.headers.get("etag"), etag);
      assert.equal(res.headers.get("cache-control"), WIDGET_CACHE_CONTROL);
      assert.equal(await res.text(), "");
    }
    assert.equal((await app.request("/widget.js", { headers: { "if-none-match": '"stale"' } })).status, 200);
  });

  it("changes the ETag when the bundle is rebuilt", async () => {
    const { app, file } = await setup();
    const before = (await app.request("/widget.js")).headers.get("etag");
    await writeFile(file, "console.log(2)");
    const later = new Date(Date.now() + 5000);
    await utimes(file, later, later);
    const res = await app.request("/widget.js", { headers: { "if-none-match": before! } });
    assert.equal(res.status, 200);
    assert.notEqual(res.headers.get("etag"), before);
    assert.equal(await res.text(), "console.log(2)");
  });

  it("404s when the bundle hasn't been built", async () => {
    const app = new Hono();
    app.get("/widget.js", widgetHandler(join(tmpdir(), "missing-widget.js")));
    assert.equal((await app.request("/widget.js")).status, 404);
  });
});
