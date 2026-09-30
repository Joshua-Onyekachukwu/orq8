#!/usr/bin/env node
/**
 * Brand surface audit.
 *
 * ORQ8 began life on a purchased template, so the failure mode this guards
 * against is specific and recurring: a surface ships the template's brand
 * instead of ours. That already happened once — the app sidebar rendered the
 * template's letterforms as the ORQ8 wordmark — and a raster logo with a
 * hardcoded path is how the same mistake returns, because nobody notices until
 * it is in front of a customer.
 *
 * Four rules, all failures:
 *
 *   1. Raster logo asset. A file named for the logo/wordmark/lockup with a
 *      raster extension in `apps/web/public`. The lockup is vector geometry in
 *      `components/branding/logo-mark.tsx`; a PNG of it will drift from it.
 *   2. Hardcoded logo path. A source string (or an `img`/`Image` src) pointing
 *      at a logo asset, instead of importing the lockup. This is how a surface
 *      silently keeps rendering an old mark after the lockup changes.
 *   3. Wrong company name in the wordmark. A foreign brand name, or the brand
 *      name rendered as `ORQ 8` / `ORQ-8`, in a *rendered* position (comments
 *      are exempt: provenance notes about the template are honest history, not
 *      a brand leak).
 *   4. A wordmark surface that does not use the lockup. The surfaces that show
 *      the wordmark must import it, so there is exactly one definition of what
 *      our name looks like.
 *
 * Reported but never failing: raster app icons (a PNG favicon is legitimate),
 * and hand-typed brand text outside the lockup. Those are notes, printed so
 * they stay visible as debt rather than being silently tolerated.
 *
 * Usage:
 *   node scripts/brand-audit.mjs            audit the repository
 *   node scripts/brand-audit.mjs --self-test  prove the rules actually fire
 *
 * Dependency-free on purpose (node:fs and node:path only) so it runs in CI
 * without an install step.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The one true name, and the single lockup that draws it. */
const BRAND_NAME = "ORQ8";
const LOCKUP_MODULE = "branding/logo-mark";

/**
 * Names that must never appear in a rendered position: the template we started
 * from, and any other product's name that has leaked in. Add to this list
 * rather than writing a new bespoke check.
 */
const FOREIGN_BRANDS = ["trezo"];

/** Raster extensions. A logo in any of these is a logo that will drift. */
const RASTER = /\.(png|jpe?g|webp|avif|gif|bmp|tiff?|ico)$/i;

/** A file whose name says it is the brand, rather than an app icon. */
const BRAND_ASSET_NAME = /(logo|wordmark|lockup|brand[-_]?mark)/i;

/** App icons: raster is fine here, but they are still worth reporting. */
const APP_ICON_NAME = /^(favicon|icon|apple-touch-icon|android-chrome|mstile)/i;

/**
 * Surfaces that display the ORQ8 wordmark. Each must use the shared lockup:
 * this is the rule that would have caught the original template-letters bug.
 */
const WORDMARK_SURFACES = [
  "apps/web/components/app-sidebar.tsx",
  "apps/web/components/admin/admin-sidebar.tsx",
  "apps/web/components/landing/Layout/Navbar.tsx",
];

/** Where brand assets and brand-bearing source can live. */
const PUBLIC_DIR = "apps/web/public";
const SOURCE_DIRS = ["apps/web/app", "apps/web/components", "apps/web/lib"];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|css)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
]);

/* ------------------------------------------------------------------ parsing */

/** Strip block and line comments, so provenance notes are not read as code. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ");
}

/** Line number of an offset, for a message someone can act on. */
function lineAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

/** Each rendered occurrence of a foreign brand, or a separated spelling. */
export function foreignNameHits(source) {
  const code = stripComments(source);
  const hits = [];
  for (const brand of FOREIGN_BRANDS) {
    const pattern = new RegExp(`\\b${brand}\\b`, "gi");
    for (const match of code.matchAll(pattern)) {
      hits.push({ text: match[0], line: lineAt(code, match.index ?? 0) });
    }
  }
  // `ORQ 8` and `ORQ-8` are wrong renderings of the wordmark. `ORQ8` is right,
  // as is the lowercase `orq8` used in identifiers, hosts and package names.
  for (const match of code.matchAll(/\bORQ([\s\-_])8\b/g)) {
    hits.push({ text: match[0], line: lineAt(code, match.index ?? 0) });
  }
  return hits;
}

/**
 * A string literal that points at a logo asset instead of the lockup.
 *
 * Every hardcoded path is a string literal, whether it feeds an `<img>`, a
 * `next/image`, or a CSS url(), so one pattern covers them all. Matching the
 * containing element as well would report the same line twice for a single
 * mistake, which reads as two problems instead of one.
 */
export function hardcodedLogoPaths(source) {
  const code = stripComments(source);
  const hits = [];
  const seen = new Set();
  const pattern =
    /["'`]([^"'`\n]*(?:logo|wordmark|lockup)[^"'`\n]*\.(?:png|jpe?g|webp|avif|gif|svg|ico))["'`]/gi;
  for (const match of code.matchAll(pattern)) {
    const line = lineAt(code, match.index ?? 0);
    if (seen.has(line)) continue;
    seen.add(line);
    hits.push({ text: (match[1] ?? match[0]).trim(), line });
  }
  return hits;
}

/** Hand-typed brand text: not a failure, but debt worth reporting. */
export function handTypedWordmarkHits(source) {
  const code = stripComments(source);
  const hits = [];
  // A JSX text node, or a string that stands alone as rendered brand text.
  const patterns = [new RegExp(`>\\s*${BRAND_NAME}\\s*<`, "g"), new RegExp(`"${BRAND_NAME}"`, "g")];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      hits.push({ text: match[0].trim(), line: lineAt(code, match.index ?? 0) });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ walking */

function walk(dir, visit) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

const rel = (full) => path.relative(repoRoot, full).split(path.sep).join("/");

/* -------------------------------------------------------------------- audit */

function audit() {
  const failures = [];
  const notes = [];
  const fail = (rule, file, detail) => failures.push({ rule, file, detail });

  // Rule 1 — raster brand assets, and app icons reported as notes.
  walk(path.join(repoRoot, PUBLIC_DIR), (full) => {
    const name = path.basename(full);
    if (!RASTER.test(name)) return;
    if (BRAND_ASSET_NAME.test(name)) {
      fail("raster-logo", rel(full), "a raster logo asset ships from public/ — the lockup is vector geometry");
    } else if (APP_ICON_NAME.test(name)) {
      notes.push(`${rel(full)}: raster app icon (allowed; a vector equivalent is preferred)`);
    }
  });

  // Rules 2 to 4 — source.
  for (const dir of SOURCE_DIRS) {
    walk(path.join(repoRoot, dir), (full) => {
      if (!SOURCE_EXT.test(full)) return;
      const file = rel(full);
      const source = readFileSync(full, "utf8");

      for (const hit of hardcodedLogoPaths(source)) {
        fail("hardcoded-logo-path", file, `line ${hit.line}: ${hit.text} — import ${LOCKUP_MODULE} instead`);
      }
      for (const hit of foreignNameHits(source)) {
        fail("wrong-wordmark-name", file, `line ${hit.line}: "${hit.text}" in a rendered position`);
      }
      for (const hit of handTypedWordmarkHits(source)) {
        notes.push(`${file}:${hit.line}: hand-typed brand text (use the lockup where a wordmark is meant)`);
      }
    });
  }

  // Rule 4 — the surfaces that show the wordmark must use the lockup.
  for (const file of WORDMARK_SURFACES) {
    const full = path.join(repoRoot, file);
    let source;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      fail("missing-wordmark-surface", file, "listed as a wordmark surface but not found");
      continue;
    }
    if (!source.includes(LOCKUP_MODULE)) {
      fail("own-lockup", file, `shows the wordmark but does not import ${LOCKUP_MODULE}`);
    }
  }

  // The lockup itself must be ours, and must name us.
  const lockup = path.join(repoRoot, "apps/web/components/branding/logo-mark.tsx");
  try {
    const source = readFileSync(lockup, "utf8");
    if (!new RegExp(`ariaLabel\\s*=\\s*"${BRAND_NAME}"`).test(source)) {
      fail("lockup-identity", rel(lockup), `the lockup does not default its ariaLabel to "${BRAND_NAME}"`);
    }
    for (const hit of foreignNameHits(source)) {
      fail("wrong-wordmark-name", rel(lockup), `line ${hit.line}: "${hit.text}" in the lockup`);
    }
  } catch {
    fail("missing-lockup", rel(lockup), "the shared lockup does not exist");
  }

  return { failures, notes };
}

/* ---------------------------------------------------------------- self-test */

/**
 * The rules are only worth having if they fire. Each fixture is a bad input the
 * rule must catch and a good input it must leave alone.
 */
function selfTest() {
  const cases = [
    {
      name: "comments are exempt from the name rule",
      got: foreignNameHits("/* Trezo Finance landing styles */\nconst x = 1;").length,
      want: 0,
    },
    {
      name: "a rendered foreign name is caught",
      got: foreignNameHits('export const A = () => <span className="x">Trezo</span>;').length,
      want: 1,
    },
    {
      name: "a separated spelling of our own name is caught",
      got: foreignNameHits('export const A = () => <span>ORQ-8</span>;').length,
      want: 1,
    },
    {
      name: "the correct name is not caught",
      got: foreignNameHits('export const A = () => <span>ORQ8</span>;').length,
      want: 0,
    },
    {
      name: "a lowercase identifier is not a wrong wordmark",
      got: foreignNameHits("const orq8ApiUrl = 'https://orq8.example';").length,
      want: 0,
    },
    {
      name: "a hardcoded raster logo path is caught",
      got: hardcodedLogoPaths('<img src="/images/logo-dark.png" alt="ORQ8" />').length,
      want: 1,
    },
    {
      name: "a hardcoded vector logo path is caught too",
      got: hardcodedLogoPaths('const mark = "/images/white-logo.svg";').length,
      want: 1,
    },
    {
      name: "importing the lockup is not a hardcoded path",
      got: hardcodedLogoPaths('import { LogoMark } from "./branding/logo-mark";').length,
      want: 0,
    },
    {
      name: "hand-typed brand text is reported",
      got: handTypedWordmarkHits("const A = () => <span>ORQ8</span>;").length,
      want: 1,
    },
  ];

  let failed = 0;
  for (const test of cases) {
    const ok = test.got === test.want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${test.name}${ok ? "" : ` (got ${test.got}, want ${test.want})`}`);
  }
  console.log(
    failed === 0
      ? `\nself-test: ${cases.length}/${cases.length} rules fire as intended`
      : `\nself-test: ${failed} of ${cases.length} rules are broken`,
  );
  return failed === 0 ? 0 : 1;
}

/* --------------------------------------------------------------------- main */

if (process.argv.includes("--self-test")) {
  process.exit(selfTest());
}

const { failures, notes } = audit();

console.log(`brand surface audit — ${BRAND_NAME}`);
console.log(`  wordmark surfaces checked: ${WORDMARK_SURFACES.length}`);
console.log(`  rules: raster logo asset, hardcoded logo path, wrong wordmark name, own lockup`);

if (notes.length > 0) {
  console.log(`\nnotes (not failures):`);
  for (const note of notes) console.log(`  - ${note}`);
}

if (failures.length === 0) {
  console.log(`\npass — no raster logo, no hardcoded logo path, no foreign name in the wordmark`);
  process.exit(0);
}

console.error(`\nFAIL — ${failures.length} brand violation(s):`);
for (const failure of failures) {
  console.error(`  ${failure.rule}  ${failure.file}\n      ${failure.detail}`);
}
process.exit(1);
