// Directives that cannot break Next's inline bootstrap scripts. A script-src policy
// needs per-request nonces and is not set here, and without one connect-src would only
// fence in fetches an injected script could still make another way; so Paddle.js
// (cdn.paddle.com) and its API calls need no entry.
//
// frame-src lists every frame we open: the Turnstile challenge and Paddle's overlay
// checkout (lib/billing/paddle-js.ts), live and sandbox. A new embed must be added here.
const frameSrc = ["'self'", "https://challenges.cloudflare.com", "https://buy.paddle.com", "https://sandbox-buy.paddle.com"];
const csp = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", `frame-src ${frameSrc.join(" ")}`].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Files in public/ change name rarely; let browsers and CDNs keep them for a day
const assetCache = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["172.20.10.*", "*.local"],
  // the workspace packages ship TypeScript source
  transpilePackages: ["@apex/db", "@apex/knowledge"],
  poweredByHeader: false,
  images: {
    // smaller than WebP where the browser supports it; the marketing photos are the heaviest bytes on the site
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
  },
  experimental: {
    // one 404 for URLs outside both root layouts (app/[lang] and app/(app))
    globalNotFound: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/marketing/:path*", headers: assetCache },
      { source: "/brand/:path*", headers: assetCache },
    ];
  },
};

export default nextConfig;
