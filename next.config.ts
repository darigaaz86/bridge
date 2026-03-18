import type { NextConfig } from "next";

/**
 * Static export for deployment to Cloudflare Pages, IPFS, or any static host.
 * No Node.js server runtime required.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Allow external images (e.g. Qore3 logo/favicon) when using next/image
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.qore3.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
        pathname: "/**",
      },
    ],
  },
  // Smaller bundles
  experimental: {
    optimizePackageImports: ["@rainbow-me/rainbowkit", "wagmi", "viem"],
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
