#!/usr/bin/env node
/**
 * Live asset verifier (MVP-001; docs/87 §4 item 7, §5 item 14).
 *
 * WHY THIS EXISTS — two incidents, one shape.
 *
 *   (1) `.vercelignore` once ignored `*.png` and `*.svg`. Every png and svg in
 *       `apps/web/public` was silently stripped from deployments while jpgs kept
 *       serving, so production's logo and quote icon 404'd and nothing failed:
 *       the verifier asserted the homepage and only the homepage.
 *
 *   (2) The guard written for (1) named two files by hand — `/images/hero-bg.png`
 *       and `/images/icons/quote.svg`. `quote.svg` was deleted from the
 *       repository on 2026-09-30 (`a7d83b5`), and from that commit on the
 *       production verifier was red for a file that *cannot exist*: every
 *       scheduled run of `.github/workflows/vercel-deploy.yml` failed at the
 *       asset probe for eleven days. Worse than the red itself, that step was
 *       the one immediately before "Release gate — is production switched on?",
 *       so the release gate never ran at all: a fixed check that can never pass
 *       took a load-bearing check down with it.
 *
 * Both failures are the same mistake — a check that knows the file names instead
 * of asking the repository. This asks the repository, in two halves:
 *
 *   local (no network, runs in CI on every commit)
 *     every asset *referenced in web source* exists in the tree the app ships
 *     from. Catches a typo, a renamed file, a referenced file that was never
 *     committed (it exists in the working tree, so a human sees it — and the
 *     deployment 404s it, because only committed files ship).
 *
 *   live (runs against the deployed domain)
 *     every asset the repository *ships* answers 200. Derived from
 *     `git ls-files apps/web/public`, so an extension class stripped by
 *     `.vercelignore` cannot hide behind whichever one file a check names, and a
 *     deleted file cannot leave a permanent red.
 *
 * Usage:
 *   node scripts/verify-live-assets.mjs --local
 *   node scripts/verify-live-assets.mjs --base-url https://orq8.vercel.app
 *   node scripts/verify-live-assets.mjs --self-test
 *
 * Options: --web-dir, --public-dir, --concurrency, --timeout-ms, --retries,
 *          --quiet.
 *
 * Exit codes: 0 pass, 1 fail, 2 usage error. No dependencies, deliberately —
 * matching `scripts/jobs-canary.mjs`, so it runs even when the install fails.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const EXIT = { pass: 0, fail: 1, usage: 2 };

/**
 * The classes a static host serves and an extension pattern in `.vercelignore`
 * can strip. Images and media are what incident (1) broke; fonts are here
 * because they fail the same way and just as silently.
 */
export const ASSET_EXTENSIONS = [
  "png", "jpg", "jpeg", "svg", "webp", "avif", "gif", "ico", "bmp",
  "mp4", "webm", "woff2", "woff", "ttf", "otf",
];

/** Source files worth scanning for references. */
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".json"];

/** Directories that hold no source we own, or generated copies of it. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".vercel", ".turbo", "dist", "coverage", "public"]);

const EXT_GROUP = ASSET_EXTENSIONS.join("|");

/**
 * A root-relative asset reference: `"/images/a.png"`, `url(/images/a.svg)`,
 * `/images/a.webp?v=2` — quoted, parenthesised, or in a template literal. A
 * query or hash is stripped before the path is resolved, because `/images/a.png?v=2`
 * and `/images/a.png` are the same file.
 */
const REFERENCE_RE = new RegExp(
  `["'\`(](\\/[A-Za-z0-9._@%+\\-/]*\\.(?:${EXT_GROUP}))(?:[?#][^"'\`)\\s]*)?["'\`)]`,
  "gi",
);

/**
 * Drop comments before scanning. Comments are not references: this repository
 * documents asset decisions in prose (`.vercelignore` names the png/svg strip in
 * its own header, and the push hook explains why `/favicon.ico` was wrong), so a
 * scanner that reads comments fails the build on a comment — a false positive
 * that gets the whole gate deleted the first time it is inconvenient. String and
 * template contents are kept, because a path there is exactly what this looks
 * for, and `//` inside `"https://…"` is therefore left alone.
 */
export function stripComments(text) {
  let out = "";
  let quote = null;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const urlPathToFile = (publicDir, urlPath) => {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    // A malformed escape is left as written; it will simply not resolve.
  }
  return path.join(publicDir, ...decoded.replace(/^\/+/, "").split("/"));
};

/**
 * Every asset the web app references, mapped to the files that reference it.
 * Pure filesystem work: no network, no repository state.
 */
export function findReferencedAssets({ webDir }) {
  const referenced = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) continue;
      const file = path.join(dir, entry.name);
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const match of stripComments(text).matchAll(REFERENCE_RE)) {
        const urlPath = match[1];
        // `//cdn.example.com/logo.png` is another origin, not a local asset.
        if (urlPath.startsWith("//")) continue;
        const relSource = path.relative(repoRoot, file).split(path.sep).join("/");
        if (!referenced.has(urlPath)) referenced.set(urlPath, new Set());
        referenced.get(urlPath).add(relSource);
      }
    }
  };
  walk(webDir);
  return referenced;
}

/**
 * Every asset the repository ships from `publicDir`, asked of git so the list
 * cannot drift from what is committed (and therefore from what deploys). Falls
 * back to walking the directory when there is no git index — a tarball, a CI
 * cache miss — and reports which it used, because the uncommitted-file check
 * below can only be made when the answer came from git.
 */
export function listShippedAssets({ publicDir, root = repoRoot } = {}) {
  const rel = path.relative(root, publicDir).split(path.sep).join("/");
  let files = [];
  let source = "walk";
  try {
    // stderr is dropped: a public dir outside the repository is a legitimate
    // fallback, not something to spray "fatal: not a git repository" for.
    const out = execFileSync("git", ["ls-files", "--", rel], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    files = out.split("\n").filter(Boolean);
    source = "git";
  } catch {
    files = [];
  }
  const urls = [];
  if (source === "git") {
    for (const file of files) {
      const relFile = file.slice(rel.length + 1);
      if (!ASSET_EXTENSIONS.includes(path.extname(relFile).slice(1).toLowerCase())) continue;
      urls.push("/" + relFile.split(path.sep).join("/"));
    }
  } else {
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (ASSET_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase())) {
          urls.push("/" + path.relative(publicDir, full).split(path.sep).join("/"));
        }
      }
    };
    if (existsSync(publicDir)) walk(publicDir);
  }
  urls.sort();
  return { urls, source };
}

/**
 * The local half: does every referenced asset actually exist where it will be
 * served from? Two distinct failures, reported separately because the fix is
 * different:
 *
 *   missing      not on disk — a typo, or a file that was deleted
 *   uncommitted  on disk but not in git — the deployment ships commits, so this
 *                is a 404 in production that every local test would pass
 */
export function checkReferences(referenced, { publicDir, shipped }) {
  const shippedSet = new Set(shipped.urls);
  const missing = [];
  const uncommitted = [];
  for (const [urlPath, sources] of [...referenced].sort(([a], [b]) => a.localeCompare(b))) {
    const sourcesList = [...sources].sort();
    if (!existsSync(urlPathToFile(publicDir, urlPath))) {
      missing.push({ urlPath, sources: sourcesList });
      continue;
    }
    if (shipped.source === "git" && !shippedSet.has(urlPath)) {
      uncommitted.push({ urlPath, sources: sourcesList });
    }
  }
  return { missing, uncommitted, checked: referenced.size };
}

/**
 * The live half: every shipped asset must answer 200 on the domain.
 *
 * A status that is not 200 is retried with a short backoff, because the run that
 * matters most is the one that follows a deploy: the deployment is READY, the
 * domain resolves, and an asset's first request can still land before its edge
 * copy exists. A network error is retried the same way and reported by name.
 */
export async function probeAssets(urls, {
  baseUrl,
  concurrency = 6,
  timeoutMs = 15_000,
  retries = 2,
  fetchImpl = fetch,
  onResult,
} = {}) {
  const base = baseUrl.replace(/\/+$/, "");
  const results = [];
  let cursor = 0;

  const probe = async (urlPath) => {
    let status = "ERR:unknown";
    let attempts = 0;
    for (attempts = 1; attempts <= retries + 1; attempts++) {
      try {
        const res = await fetchImpl(base + encodeURI(urlPath), {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "cache-control": "no-cache" },
        });
        status = res.status;
      } catch (error) {
        status = `ERR:${error?.name ?? "Error"}`;
      }
      if (status === 200) break;
      if (attempts <= retries) await new Promise((r) => setTimeout(r, 750 * attempts));
    }
    const result = { urlPath, status, attempts };
    results.push(result);
    onResult?.(result);
    return result;
  };

  const worker = async () => {
    while (cursor < urls.length) await probe(urls[cursor++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, worker));

  results.sort((a, b) => a.urlPath.localeCompare(b.urlPath));
  return { base, results, failures: results.filter((r) => r.status !== 200) };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : fallback;
};

const local = args.includes("--local");
const quiet = args.includes("--quiet");
const webDir = path.resolve(repoRoot, flag("web-dir", "apps/web"));
const publicDir = path.resolve(repoRoot, flag("public-dir", path.join(flag("web-dir", "apps/web"), "public")));
const baseUrl = flag("base-url", process.env.PRODUCTION_WEB_URL);
const doLocal = local || (!baseUrl && !args.includes("--self-test"));

/**
 * The local half in one call, so the CLI and the self-test share it. Returns the
 * same shape the reporting below expects.
 */
export function runLocalScan({ webDir: dir, publicDir: pub, root = repoRoot } = {}) {
  const referenced = findReferencedAssets({ webDir: dir });
  const shipped = listShippedAssets({ publicDir: pub, root });
  const { missing, uncommitted, checked } = checkReferences(referenced, { publicDir: pub, shipped });
  // A scanner that finds nothing would pass every check vacuously — the shape of
  // a green gate that never ran. This app references ~8 assets from its landing
  // page; zero means the scanner is broken, so it fails instead.
  const vacuous = checked === 0;
  return { referenced, shipped, missing, uncommitted, checked, vacuous };
}

function reportLocal(scan) {
  console.log(`source-referenced assets: ${scan.checked}`);
  if (scan.vacuous) {
    console.error(
      "::error::the scanner found no referenced assets at all in this tree — that is a broken scanner, not a clean app, so this check cannot pass",
    );
    return false;
  }
  for (const { urlPath, sources } of scan.missing) {
    console.error(`::error::${urlPath} is referenced but not in the tree — the deployment would 404 it`);
    for (const source of sources) console.error(`         referenced by ${source}`);
  }
  if (scan.uncommitted.length) {
    console.error(
      `::error::${scan.uncommitted.length} referenced asset(s) exist in the working tree but are not committed: the deployment ships commits, so these 404 in production while every local check passes`,
    );
    for (const { urlPath, sources } of scan.uncommitted) {
      console.error(`         ${urlPath}`);
      for (const source of sources) console.error(`           referenced by ${source}`);
      console.error(`           fix: git add ${path.join(path.relative(repoRoot, publicDir), urlPath.slice(1))}`);
    }
  }
  if (!quiet) {
    for (const [urlPath, sources] of [...scan.referenced].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ok  ${urlPath}  (${[...sources].join(", ")})`);
    }
  }
  return scan.missing.length === 0 && scan.uncommitted.length === 0;
}

function reportLive(probe, shipped) {
  console.log(`shipped assets (from ${shipped.source}): ${shipped.urls.length}`);
  if (probe.failures.length === 0) {
    console.log(`all ${probe.results.length} served 200 from ${probe.base}`);
    return true;
  }
  // Naming the classes that failed is what turns "two files 404" into the actual
  // cause: if every svg failed and every jpg served, it is `.vercelignore`.
  const failedByExtension = new Map();
  for (const { urlPath, status } of probe.failures) {
    const ext = path.extname(urlPath).slice(1).toLowerCase();
    if (!failedByExtension.has(ext)) failedByExtension.set(ext, { count: 0, sample: urlPath, status });
    failedByExtension.get(ext).count++;
  }
  console.error(
    `::error::${probe.failures.length} of ${probe.results.length} shipped assets do not serve from ${probe.base}`,
  );
  for (const { urlPath, status, attempts } of probe.failures) {
    console.error(`         ${String(status).padEnd(10)} ${urlPath} (${attempts} attempt(s))`);
  }
  for (const [ext, { count, sample, status }] of [...failedByExtension].sort((a, b) => b[1].count - a[1].count)) {
    console.error(`         whole class: ${count} .${ext} failed (e.g. ${sample} → ${status})`);
  }
  console.error(
    "         fix: check .vercelignore for an extension or directory pattern that strips these (it must never list *.png/*.svg/*.jpg), and that each file is committed to apps/web/public",
  );
  return false;
}

async function main() {
  if (!local && !baseUrl) {
    console.error("usage: node scripts/verify-live-assets.mjs --local | --base-url URL [--web-dir DIR] [--public-dir DIR]");
    process.exitCode = EXIT.usage;
    return;
  }

  let ok = true;
  if (doLocal) {
    console.log(`=== referenced assets (local, ${path.relative(repoRoot, webDir)}) ===`);
    ok = reportLocal(runLocalScan({ webDir, publicDir })) && ok;
  }
  if (baseUrl) {
    const shipped = listShippedAssets({ publicDir });
    console.log(`\n=== shipped assets (live, ${baseUrl}) ===`);
    const probe = await probeAssets(shipped.urls, {
      baseUrl,
      concurrency: Number(flag("concurrency", 6)),
      timeoutMs: Number(flag("timeout-ms", 15_000)),
      retries: Number(flag("retries", 2)),
    });
    ok = reportLive(probe, shipped) && ok;
  }
  console.log(ok ? "\npass" : "\nFAIL");
  process.exitCode = ok ? EXIT.pass : EXIT.fail;
}

/* ── Self-test ───────────────────────────────────────────────────────────── */

/**
 * Every case is a real tree on disk and a real HTTP server, because the two
 * failures this file exists for were both *checks that could not fail*: a probe
 * naming a deleted file, and a scanner that would pass a tree with nothing in
 * it. The cases pin both, plus the `.vercelignore` class-strip that started it.
 * `node scripts/verify-live-assets.mjs --self-test`, wired into `scripts/proofs.mjs`.
 */
async function selfTest() {
  let pass = 0;
  let failed = 0;
  const ok = (name, cond, detail = "") => {
    if (cond) {
      pass++;
      console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
    } else {
      failed++;
      console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

  const root = mkdtempSync(path.join(tmpdir(), "orq8-assets-"));
  const web = path.join(root, "apps/web");
  const pub = path.join(web, "public");
  const put = (rel, body = "x") => {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
    return full;
  };

  try {
    // A landing page that references three assets: one exists, one carries a
    // query string (the same file), one was deleted and never noticed.
    put("apps/web/components/Landing.tsx", `
      <Image src="/images/hero.png" alt="hero" />
      <img src="/images/icon.svg?v=2" alt="icon" />
      <img src="/images/gone.webp" alt="gone" />
    `);
    put("apps/web/public/images/hero.png");
    put("apps/web/public/images/icon.svg");

    // `git ls-files` cannot answer for a temp tree, so the shipped list is given
    // explicitly — which is also how the uncommitted case is created below.
    const shippedAll = {
      source: "git",
      urls: ["/images/hero.png", "/images/icon.svg", "/images/gone.webp"],
    };

    console.log("=== asset verifier self-test ===");

    // 1. The reference scan sees all three, and a query string resolves to the
    //    file it names rather than being treated as a different asset.
    const found = findReferencedAssets({ webDir: web });
    ok("scanner finds every reference", found.size === 3, [...found.keys()].join(" "));
    ok("a query string does not create a second asset", found.has("/images/icon.svg"));

    // 2. The deleted file is named, with the file that references it — the case
    //    that produced eleven days of unpassable red when it was hard-coded.
    const first = checkReferences(found, { publicDir: pub, shipped: shippedAll });
    ok("a referenced-but-deleted asset fails", first.missing.length === 1 && first.missing[0].urlPath === "/images/gone.webp");
    ok("the failure names the referencing file", /Landing\.tsx$/.test(first.missing[0].sources[0] ?? ""), first.missing[0].sources[0]);

    // 3. A file that exists but was never committed ships as a 404 — the case a
    //    purely filesystem check passes and production fails.
    const uncommittedTree = checkReferences(found, {
      publicDir: pub,
      shipped: { source: "git", urls: ["/images/hero.png"] },
    });
    ok(
      "an uncommitted asset fails",
      uncommittedTree.uncommitted.length === 1 && uncommittedTree.uncommitted[0].urlPath === "/images/icon.svg",
    );

    // 4. A comment naming a missing file is not a reference. This is not
    //    hypothetical: writing "`/favicon.ico` is not a file this app ships" in
    //    the fix for case 2 made the first version of this scanner fail.
    put("apps/web/components/Comment.tsx", `
      // /images/deleted-in-a-comment.svg is mentioned in prose only
      /* and /images/also-deleted.png here */
      export const uses = "/images/hero.png";
    `);
    const commented = findReferencedAssets({ webDir: path.join(root, "apps/web/components") });
    ok("comments are not references", !commented.has("/images/deleted-in-a-comment.svg") && !commented.has("/images/also-deleted.png"), [...commented.keys()].join(" "));
    ok("a path in a string beside a comment is still a reference", commented.has("/images/hero.png"));

    // 5. And a fully committed, present tree passes — the check has to be able to
    //    report clean, or it is the same defect in the other direction.
    const cleanWeb = path.join(root, "clean-web");
    put("clean-web/components/Landing.tsx", `<img src="/images/hero.png" /><img src="/images/icon.svg" />`);
    const cleanRefs = findReferencedAssets({ webDir: cleanWeb });
    const clean = checkReferences(cleanRefs, {
      publicDir: pub,
      shipped: { source: "git", urls: ["/images/hero.png", "/images/icon.svg"] },
    });
    ok(
      "a clean tree passes",
      clean.missing.length === 0 && clean.uncommitted.length === 0 && clean.checked === 2,
      `checked=${clean.checked} missing=${clean.missing.length} uncommitted=${clean.uncommitted.length}`,
    );

    // 6. A tree with no references at all is a broken scanner, not a clean app.
    const emptyWeb = path.join(root, "empty-web");
    put("empty-web/nothing.ts", "export const x = 1;");
    const vacuous = runLocalScan({ webDir: emptyWeb, publicDir: pub, root });
    ok("a scanner that finds nothing fails instead of passing vacuously", vacuous.vacuous === true, `checked=${vacuous.checked}`);

    // 7. Live, all 200: the shipped list is what is asked for.
    const good = await startFixtureServer({ "/images/hero.png": {}, "/images/icon.svg": {} });
    try {
      const probe = await probeAssets(["/images/hero.png", "/images/icon.svg"], { baseUrl: good.url, retries: 0 });
      ok("a domain serving every asset passes", probe.failures.length === 0, `${probe.results.length} probed`);
      ok("every asset is asked for, not a sample", probe.results.length === 2);
    } finally {
      await good.close();
    }

    // 8. Live, the incident this replaces: the svg class is stripped, the png
    //    class serves. The failure must name the class.
    const stripped = await startFixtureServer({ "/images/hero.png": {} });
    try {
      const probe = await probeAssets(["/images/hero.png", "/images/icon.svg"], { baseUrl: stripped.url, retries: 0 });
      ok("an extension class stripped by .vercelignore fails", probe.failures.length === 1, probe.failures.map((f) => `${f.urlPath}=${f.status}`).join(" "));
      ok("the failure is the svg, not the png", probe.failures[0]?.urlPath === "/images/icon.svg");
      const printed = [];
      const realError = console.error;
      console.error = (...parts) => printed.push(parts.join(" "));
      try {
        reportLive(probe, { source: "git", urls: ["/images/hero.png", "/images/icon.svg"] });
      } finally {
        console.error = realError;
      }
      ok("the report names .vercelignore as the cause", printed.join("\n").includes(".vercelignore"));
    } finally {
      await stripped.close();
    }

    // 9. A host that is not answering at all is a failure, not a skip — the
    //    shape of a verifier that reports green because it could not ask.
    const dead = await probeAssets(["/images/hero.png"], { baseUrl: "http://127.0.0.1:1", retries: 0, timeoutMs: 2000 });
    ok("an unreachable domain fails", dead.failures.length === 1 && String(dead.failures[0].status).startsWith("ERR:"), String(dead.failures[0].status));

    // 10. The shipped list is derived, not written: whatever is committed is what
    //    is asked for, including a file no code references (production serves
    //    /images/hero-bg.png today although nothing links it — a hard-coded list
    //    is what rotted, so the repository is the source).
    const shippedReal = listShippedAssets({ publicDir: path.join(repoRoot, "apps/web/public") });
    ok("the shipped list comes from git", shippedReal.source === "git", `${shippedReal.urls.length} files`);
    ok("the shipped list is non-trivial", shippedReal.urls.length > 20, `${shippedReal.urls.length} files`);
    ok(
      "the list that rotted is not in the repository any more",
      !shippedReal.urls.includes("/images/icons/quote.svg"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n=== ASSET-VERIFIER SELF-TEST: ${pass} passed, ${failed} failed ===`);
  process.exitCode = failed > 0 ? EXIT.fail : EXIT.pass;
}

/** A real HTTP server for the self-test: routes map a pathname to a status. */
async function startFixtureServer(routes) {
  const server = createServer((req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0];
    const route = routes[urlPath];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(route.status ?? 200, { "content-type": route.type ?? "application/octet-stream" });
    res.end(route.body ?? "fixture");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (args.includes("--self-test")) {
  await selfTest();
} else {
  await main();
}
