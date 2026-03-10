import type { NextConfig } from "next";

/**
 * Deployed on EC2 with Docker. Uses standalone output for minimal image size.
 */
const nextConfig: NextConfig = {
  output: "standalone",
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
