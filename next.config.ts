import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Playwright / tools that hit 127.0.0.1 while `next dev` serves localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // sharp is a native optional runtime dependency used by Phase 14d media optimize.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
