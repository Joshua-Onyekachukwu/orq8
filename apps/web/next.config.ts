import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages used by the web app
  transpilePackages: ["@orq8/core", "@orq8/auth", "@orq8/domain"],
};

export default nextConfig;
