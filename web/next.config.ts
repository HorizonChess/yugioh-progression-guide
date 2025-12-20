import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
