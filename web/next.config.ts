import type { NextConfig } from "next";

// Set by the GitHub Pages workflow, which serves the site from /yugioh-progression-guide
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  // Static HTML export: the app has no server code, so any static host can serve it
  output: 'export',
  basePath,
  trailingSlash: true,
  images: {
    // Skip Next.js image optimization; load remote images directly
    unoptimized: true,
    qualities: [75, 90, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-9397530dccf24d04a56c8eafb6e3edd0.r2.dev',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
