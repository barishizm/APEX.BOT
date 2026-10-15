/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["172.20.10.*", "*.local"],
  // the workspace packages ship TypeScript source
  transpilePackages: ["@apex/db", "@apex/knowledge"],
};

export default nextConfig;
