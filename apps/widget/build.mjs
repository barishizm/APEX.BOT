// Bundles the widget into one self-contained IIFE: dist/widget.js.
import { build, context } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Raised from 40 KB for the header menu (new chat, end chat, tickets), then for the composer's
// file and voice input, each with its five locales, then for fitting phones (keyboard, page
// pan, scroll lock). What visitors download is the gzip size, so that has its own, tighter cap.
const LIMIT = 80 * 1024;
const GZIP_LIMIT = 26 * 1024;

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/widget.js",
  bundle: true,
  format: "iife",
  target: ["es2020", "safari15"],
  minify: true,
  legalComments: "none",
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  await (await context({ ...options, minify: false, sourcemap: "inline" })).watch();
} else {
  await build(options);
  const bytes = readFileSync(options.outfile);
  const gz = gzipSync(bytes).length;
  console.log(`widget.js: ${(bytes.length / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzip)`);
  if (bytes.length > LIMIT || gz > GZIP_LIMIT) {
    console.error(`widget.js exceeds its budget (${LIMIT / 1024} KB, ${GZIP_LIMIT / 1024} KB gzip)`);
    process.exit(1);
  }
}
