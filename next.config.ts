import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Playwright / tools that hit 127.0.0.1 while `next dev` serves localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
