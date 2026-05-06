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
  // Bumped from default 10MB to support /api/admin/atlas/ingest/upload, which
  // accepts batches of Atlas manufacturer JSON files (some single files >20MB,
  // typical refresh batch up to ~200MB across folder upload). middleware.ts is
  // treated as a proxy in Next.js 16, so the proxy-namespaced option applies.
  experimental: {
    proxyClientMaxBodySize: '256mb',
  },
};

export default nextConfig;
