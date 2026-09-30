import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages used by the web app
  transpilePackages: ["@orq8/core", "@orq8/auth", "@orq8/domain"],

  // Performance: cache static assets aggressively. API responses are NOT cached
  // here — see the note below.
  async headers() {
    return [
      {
        // Static assets (fonts, images, JS, CSS) — cache 1 year
        source: "/(.*)\\.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot|css|js)$",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // There used to be a rule here applying
      // `private, s-maxage=15, stale-while-revalidate=30` to `/api/(.*)`, with a
      // comment saying individual route handlers could opt out. They could not:
      // Next applies config headers AFTER the handler, so the rule silently
      // overwrote every handler's own `no-store`. The cost was not theoretical.
      // A task page runs an action and then refetches itself; the refetch was
      // served the body from before the action for up to 45 seconds, so the
      // founder read "The task is now awaiting approval" next to a PENDING badge
      // and no link to the decision that was waiting for them. Every check that
      // said "this response is not cacheable" was overridden by a file nobody
      // would think to look in.
      //
      // Caching is now the route's decision (lib/api.ts defaults reads to
      // `no-store` and takes an explicit `cache: 'public'` to opt in), which is
      // the only place that knows whether a response is tenant-scoped, an event
      // stream, or genuinely shared.
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
