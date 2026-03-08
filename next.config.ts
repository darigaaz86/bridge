import type { NextConfig } from "next";

/**
 * Optimized for deployment on Cloudflare Pages.
 * npm run build produces a static export in the `out` folder (deploy that to Pages).
 */
const nextConfig: NextConfig = {
  output: 'export',
  // Allow external images (e.g. Qore3 logo/favicon) when using next/image
  images: {
    unoptimized: true, // required for static export (no image optimization server)
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
  // Smaller bundles for edge (Cloudflare Workers runtime)
  experimental: {
    optimizePackageImports: ["@rainbow-me/rainbowkit", "wagmi", "viem"],
  },
  // Consistent URLs; Cloudflare caches by path
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
