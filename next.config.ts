import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LAST_UPDATED: new Date().toISOString(),
    // Smart-chat Phase 1 feature flags. Committed here so the GitHub-pickup deploy
    // inlines them at build time — no deploy-env / IT change needed. Each is an
    // INDEPENDENT switch: delete a single line to turn that one feature back off.
    // Enabled 2026-07-27 after local validation of all four (see chat-intelligence plan).
    FAMILY_KNOWLEDGE_ENABLED: '1',
    REFLECT_BACK_ENABLED: '1',
    SELECTION_VALIDATION_ENABLED: '1',
    PER_MFR_CARDS_ENABLED: '1',
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
