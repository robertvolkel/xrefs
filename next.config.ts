import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LAST_UPDATED: new Date().toISOString(),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'logo.clearbit.com' },
    ],
  },
};

export default nextConfig;
