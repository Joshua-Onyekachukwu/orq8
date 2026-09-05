#!/usr/bin/env node
/**
 * ORQ8 contrast regression test (Phase 13).
 *
 * WHY THIS EXISTS
 * --------------
 * Tailwind v4's `@theme inline` maps `--color-muted` to the *background* shade
 * (#f5f5f5), so `text-muted` painted TEXT with the near-white background token —
 * making dashboard labels ("1 total", "0 completed", "0% used", "This week")
 * effectively invisible on white cards. The fix lives in apps/web/app/globals.css
 * as unlayered overrides. This script is the tripwire that fails CI/build if that
 * failure mode or any equivalent faint-text regression returns.
 *
 * It checks two layers:
 *   1. TOKEN RESOLUTION (the actual failure) — reads globals.css, parses the
 *      `:root` (light) and `.dark` token blocks, resolves the semantic
 *      foreground/background pairs (muted text on cards, ink, foreground, dark
 *      parchment/fog on abyss/void), and computes the WCAG AA contrast ratio
 *      for BOTH themes. Also asserts `--muted` (background) and
 *      `--muted-foreground` (text) are distinct, and that the unlayered
 *      `.text-muted` override exists outside Tailwind's @layer utilities.
 *   2. SOURCE SCAN — walks apps/web/{app,components} and fails on banned
 *      faint-text utilities (`text-ink-faint`, `text-gray-200/300/400`), which
 *      are below ~4.5:1 on light surfaces. An explicit allowlist documents the
 *      only justified exceptions (decorative separators / dark-surface tokens).
 *
 * NOTE: token-level pairs are the tripwire for the design system; the dashboard
 * also carries a dev-only rendered check (components/contrast-self-check.tsx)
 * that samples actual computed styles in the browser.
 *
 * Run: `pnpm --filter @orq8/web test:contrast`  (or `node scripts/contrast-check.mjs`)
 * Exit code 1 = regression detected.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GLOBALS = path.join(WEB_ROOT, "app", "globals.css");

let failures = 0;
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

// ─── WCAG contrast math ───────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ─── 1. Token-resolution check on the real CSS (light + dark themes) ───────────

console.log("contrast-check: reading", path.relative(process.cwd(), GLOBALS));
const css = readFileSync(GLOBALS, "utf8");

if (!css.includes(".text-muted")) {
  fail("globals.css has no .text-muted override at all — the contrast fix is missing");
}

// The winning rule must be the unlayered override, not Tailwind's @layer utilities.
const overrideRule = /(?:^|\n)\s*\.text-muted\s*\{\s*color:\s*var\(--muted-foreground[^}]*\}\s*\n/s.exec(css);
if (!overrideRule) {
  fail(".text-muted override rule missing (expected unlayered `color: var(--muted-foreground, …)`)");
}

// Distinctness: --muted (background) must never equal --muted-foreground (text).
const bgToken = /--muted:\s*([^;]+);/.exec(css)?.[1]?.trim();
const fgToken = /--muted-foreground:\s*([^;]+);/.exec(css)?.[1]?.trim();
if (bgToken === fgToken) {
  fail(`--muted and --muted-foreground resolve identically (${bgToken}) — text-muted == background`);
}

// Parse a CSS block into { token: rawValue }. Handles :root (light) and .dark.
function parseTokenBlock(block) {
  const tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

function resolveColor(tokenName, tokens) {
  let value = tokens[tokenName];
  for (let depth = 0; depth < 6 && value; depth++) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (hex) return `#${hex[1].toLowerCase()}`;
    // oklch(1 0 0) is white (light surfaces); anything else non-hex is unparsable here.
    if (/^oklch\(1\s+0\s+0\)$/i.test(value)) return "#ffffff";
    const ref = /^var\(--([a-z0-9-]+)\)$/i.exec(value);
    if (ref) {
      value = tokens[ref[1]];
      continue;
    }
    return null;
  }
  return null;
}

// Locate the :root block (light theme) and the .dark block.
function blockAfter(pattern) {
  const start = pattern.exec(css);
  if (!start) return null;
  const open = css.indexOf("{", start.index);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

// The --color-* palette lives across several `@theme`/`@theme inline` blocks;
// semantic tokens in :root (light) and .dark override/point at it. Merge them
// all (later blocks may redefine tokens).
const themeBlocks = [...css.matchAll(/@theme(?:\s+inline)?\s*\{([^}]*)\}/gs)].map((m) => m[1]);
const palette = Object.assign({}, ...themeBlocks.map(parseTokenBlock));
const rootBlock = blockAfter(/(?:^|\n)\s*:root\s*\{/m) ?? "";
const darkBlock = blockAfter(/(?:^|\n)\/\*\s*---break---\s*\*\/\s*\.dark\s*\{/m) ?? "";
if (Object.keys(palette).length === 0 || rootBlock === "" || darkBlock === "") {
  fail("could not locate @theme inline / :root / .dark token blocks in globals.css");
}
const lightTokens = { ...palette, ...parseTokenBlock(rootBlock) };
const darkTokens = { ...palette, ...parseTokenBlock(darkBlock) };

/** Resolve a foreground + background token pair and assert AA. */
function checkPair({ theme, fgName, bgName, label, tokens }) {
  const fgHex = resolveColor(fgName, tokens);
  const bgHex = resolveColor(bgName, tokens);
  if (!fgHex || !bgHex) {
    fail(`${theme}: cannot resolve pair ${label} (${fgName} → ${fgHex ?? "?"} on ${bgName} → ${bgHex ?? "?"})`);
    return;
  }
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  const ratio = fg && bg ? contrastRatio(fg, bg) : 0;
  console.log(`  [${theme}] ${label}: ${fgHex} on ${bgHex} = ${ratio.toFixed(2)}:1 (WCAG AA ≥ 4.5)`);
  if (ratio < 4.5) fail(`${theme}: ${label} is ${ratio.toFixed(2)}:1 — below WCAG AA (4.5:1)`);
}

// Light theme pairs — white cards on the light background.
checkPair({ theme: "light", fgName: "muted-foreground", bgName: "card", label: "muted text on card", tokens: lightTokens });
checkPair({ theme: "light", fgName: "color-ink-muted", bgName: "card", label: "ink-muted on card", tokens: lightTokens });
checkPair({ theme: "light", fgName: "color-ink", bgName: "card", label: "ink on card", tokens: lightTokens });
checkPair({ theme: "light", fgName: "foreground", bgName: "card", label: "foreground on card", tokens: lightTokens });

// Dark theme pairs — parchment/fog text on abyss cards and void background.
checkPair({ theme: "dark", fgName: "muted-foreground", bgName: "card", label: "muted text on card", tokens: darkTokens });
checkPair({ theme: "dark", fgName: "foreground", bgName: "card", label: "foreground on card", tokens: darkTokens });
checkPair({ theme: "dark", fgName: "foreground", bgName: "background", label: "foreground on background", tokens: darkTokens });
checkPair({ theme: "dark", fgName: "muted-foreground", bgName: "background", label: "muted text on background", tokens: darkTokens });
checkPair({ theme: "dark", fgName: "primary-foreground", bgName: "primary", label: "primary-foreground on primary (emerald CTA)", tokens: darkTokens });

// ─── 2. Source scan — banned faint text utilities ─────────────────────────────

// Explicit allowlist of justified exceptions. Each entry suppresses only when
// the file's line contains BOTH the class and the snippet.
const ALLOW = [
  {
    file: path.join("components", "top-bar.tsx"),
    className: "text-gray-300",
    snippet: "text-gray-300\">·</span>",
    reason: "decorative breadcrumb separator (org name · plan) — both sides are readable gray-500 text",
  },
];

const BANNED = [/text-ink-faint/, /text-gray-200/, /text-gray-300/, /text-gray-400/];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

for (const dir of ["app", "components"]) {
  const abs = path.join(WEB_ROOT, dir);
  for (const file of walk(abs)) {
    const rel = path.relative(WEB_ROOT, file).replace(/\\/g, "/");
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      for (const pattern of BANNED) {
        if (!pattern.test(line)) continue;
        const cls = pattern.source; // e.g. text-gray-300
        const allowed = ALLOW.some(
          (a) => a.file.replace(/\\/g, "/") === rel && line.includes(a.className) && line.includes(a.snippet),
        );
        if (allowed) {
          console.log(`  (allowed) ${rel}:${idx + 1} ${cls} — ${ALLOW.find((a) => a.file.replace(/\\/g, "/") === rel)?.reason}`);
          continue;
        }
        fail(`${rel}:${idx + 1} uses ${cls} (${line.trim().slice(0, 80)}) — below ~4.5:1 on light surfaces`);
      }
    });
  }
}

console.log(failures === 0 ? "\ncontrast-check: PASS — no contrast regressions" : `\ncontrast-check: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);