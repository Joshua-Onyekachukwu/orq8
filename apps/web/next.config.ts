import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages if the web app starts importing them.
  // Nothing shared yet — the public site is static for now.
  reactStrictMode: true,
};

export default nextConfig;
