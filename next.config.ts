import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright serves the dev app on this loopback host in CI.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
