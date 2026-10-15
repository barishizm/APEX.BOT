// Directives that cannot break Next's inline bootstrap scripts. A script-src policy
// needs per-request nonces and is not set here.
const csp = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["172.20.10.*", "*.local"],
  // the workspace packages ship TypeScript source
  transpilePackages: ["@apex/db", "@apex/knowledge"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
