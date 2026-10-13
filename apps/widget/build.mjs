// Bundles the widget into one self-contained IIFE: dist/widget.js.
import { build, context } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Raised from 30 KB for the dashboard settings (themes, lead form, teaser, auto-open); ~12 KB gzipped
const LIMIT = 36 * 1024;
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
  if (bytes.length > LIMIT) {
    console.error(`widget.js exceeds the ${LIMIT / 1024} KB budget`);
    process.exit(1);
  }
}
