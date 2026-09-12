/**
 * E2E regression guard: every `/api/...` path the web app fetches must have a
 * Next.js route handler proxy under `app/api/**`.
 *
 * Why: the browser can only call same-origin URLs. Pages fetch `/api/x`, and a
 * route handler under `app/api/x/route.ts` proxies that call server-side to the
 * ORQ8 API (docs/06, 35). When a page adds a fetch for an endpoint nobody
 * proxied, the code compiles, typechecks, passes logic tests — and 404s in
 * production (real incidents: `/api/quality/review/:taskId`,
 * `/api/agents/:id/performance-action`). This test catches the gap statically,
 * at PR time, before any deploy.
 *
 * How: walks every route.ts under app/api to build the proxy table, scans all
 * web source for fetchable `/api/...` string/template-literal paths, and
 * requires each one to match a proxy (longest match wins, `[param]` segments
 * match any single segment, paths cut at `?`/`${` are matched as prefixes).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from apps/web (the workspace test script), so cwd is the web root.
const WEB_ROOT = process.cwd();

// ── Proxy table ────────────────────────────────────────────────────────────

function walkRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkRouteFiles(full, acc);
    else if (entry === "route.ts" || entry === "route.tsx") acc.push(full);
  }
  return acc;
}

/** `/api/agents/[id]/route.ts` → `/api/agents/:id` */
function proxyPatternFromRouteFile(routeFile: string): string {
  const rel = relative(join(WEB_ROOT, "app"), routeFile).split(sep).join("/");
  const withoutRoute = rel.replace(/\/route\.tsx?$/, "");
  return "/" + withoutRoute.replace(/\[([^\]]+)\]/g, ":$1");
}

const PROXY_PATTERNS: string[] = walkRouteFiles(join(WEB_ROOT, "app", "api")).map(
  proxyPatternFromRouteFile,
);

function segmentMatch(patternSegs: string[], pathSegs: string[], prefixMode: boolean): boolean {
  if (pathSegs.length > patternSegs.length) return false;
  if (!prefixMode && pathSegs.length !== patternSegs.length) return false;
  return patternSegs.every((seg, i) => {
    if (i >= pathSegs.length) return true; // prefix mode: pattern may extend further
    const pathSeg = pathSegs[i]!;
    if (seg.startsWith(":")) return pathSeg.length > 0;
    return seg === pathSeg;
  });
}

/** Any proxy whose pattern matches the fetched path (longest pattern wins). */
function findProxy(fetchedPath: string, prefixMode: boolean): string | null {
  const pathSegs = fetchedPath.split("/").filter(Boolean);
  const matches = PROXY_PATTERNS.filter((pattern) =>
    segmentMatch(pattern.split("/").filter(Boolean), pathSegs, prefixMode),
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

// ── Fetch path extraction ──────────────────────────────────────────────────

// Matches "/api/..." inside string or template literals. Trailing portions
// (`?…`, `${…}`) are stripped: a path cut at a query or interpolation is still
// matchable in prefix mode.
const FETCH_PATH_RE = /["'`](\/api\/[A-Za-z0-9_\-./:${}]+)["'`]/g;

function extractFetchPaths(source: string): string[] {
  const paths: string[] = [];
  for (const m of source.matchAll(FETCH_PATH_RE)) {
    let p = m[1] ?? "";
    p = p.replace(/\$\{[^}]*\}.*$/, ""); // `/api/x/${id}` → `/api/x/` (prefix)
    p = p.replace(/\?.*$/, ""); // drop query strings
    p = p.replace(/\/+$/, "") || "/";
    if (p !== "/api") paths.push(p);
  }
  return paths;
}

const SOURCE_DIRS = ["app", "components", "hooks", "lib"];

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSourceFiles(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry)) acc.push(full);
  }
  return acc;
}

// Route handlers legitimately reference *other* proxies (forwarding logic) and
// tests/lib code may reference fully-proxied paths; scanning everything is the
// point — the failure mode is a MISSING proxy, not an extra reference.

describe("API proxy coverage", () => {
  it("has a proxy table to check against (sanity)", () => {
    expect(PROXY_PATTERNS.length).toBeGreaterThan(40);
    expect(PROXY_PATTERNS).toContain("/api/agents");
    expect(PROXY_PATTERNS).toContain("/api/commands/stream");
  });

  it("every fetched /api path resolves to a Next.js proxy route", () => {
    const missing: string[] = [];

    for (const dir of SOURCE_DIRS) {
      for (const file of walkSourceFiles(join(WEB_ROOT, dir))) {
        const source = readFileSync(file, "utf8");
        for (const rawPath of extractFetchPaths(source)) {
          const hit = findProxy(rawPath, false) ?? findProxy(rawPath, true);
          if (!hit) {
            const rel = relative(WEB_ROOT, file).split(sep).join("/");
            missing.push(`${rawPath}  ←  ${rel}`);
          }
        }
      }
    }

    expect(
      missing,
      `These fetched endpoints have no app/api/**/route.ts proxy and will 404 ` +
        `same-origin in the browser. Add the missing route handlers (follow the ` +
        `existing proxy pattern, e.g. app/api/agents/[id]/route.ts):\n  ` +
        missing.join("\n  "),
    ).toEqual([]);
  });
});
