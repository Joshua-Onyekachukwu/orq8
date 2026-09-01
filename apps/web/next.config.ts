import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages used by the web app
  transpilePackages: ["@orq8/core", "@orq8/auth", "@orq8/domain"],

  // Performance: cache static assets aggressively, API routes no-cache
  async headers() {
    return [
      {
        // Static assets (fonts, images, JS, CSS) — cache 1 year
        source: "/(.*)\\.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot|css|js)$",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // API proxy routes — no cache, must revalidate
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        // Public pages — short cache for faster revisits
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=600" },
        ],
      },
      {
        source: "/(about|pricing|contact)",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=600" },
        ],
      },
    ];
  },
};

export default nextConfig;
