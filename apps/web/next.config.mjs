/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["172.20.10.*", "*.local"],
  // @apex/db ships TypeScript source
  transpilePackages: ["@apex/db"],
};

export default nextConfig;
