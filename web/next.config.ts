import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
