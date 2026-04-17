import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function getLastUpdatedIso(): string {
  try {
    return execSync("git log -1 --format=%cI", { encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString();
  }
}

const nextConfig: NextConfig = {
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LAST_UPDATED: getLastUpdatedIso(),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'logo.clearbit.com' },
    ],
  },
};

export default nextConfig;
