/**
 * Color contrast audit (docs/65_COLOR_SYSTEM.md §7).
 *
 * The palette's accessibility claims have to be measured, not asserted. This
 * script reads the real token values out of `apps/web/app/globals.css` — the
 * single source of truth — evaluates every pair the interface actually
 * composes, and fails when a pair marked REQUIRED drops below WCAG AA.
 *
 * It understands `#rrggbb` and `color-mix(in srgb, #aaa N%, #bbb)` so that
 * derived tones are measured too. Semi-transparent values are reported as
 * unmeasurable rather than quietly skipped.
 *
 * Run: pnpm exec tsx scripts/color-contrast-audit.ts
 */
import { readFileSync } from "node:fs";

const CSS_PATH = "apps/web/app/globals.css";

/** WCAG AA thresholds. */
const AA_TEXT = 4.5; // normal body text
const AA_UI = 3; // large text, icons, control boundaries, data marks

type Scope = "light" | "ink";

/** Extract the CSS block that starts at `marker`. */
function readBlock(css: string, marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`could not find "${marker}" in ${CSS_PATH}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i);
    }
  }
  throw new Error(`unterminated block "${marker}" in ${CSS_PATH}`);
}

/** Every `--orq-*` declaration in a block, as raw source strings. */
function readTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--orq-[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.trim();
  }
  return tokens;
}

/**
 * Every custom property in a block, whatever its prefix. The console re-points
 * `--orq-*` at `--console-*` primitives, so measuring the console needs both
 * halves of the chain in one map.
 */
function readVars(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.trim();
  }
  return tokens;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Resolve a token value to rgb, following one level of `var()` and blending
 * `color-mix(in srgb, …)`. Returns null for anything translucent, which the
 * audit reports as unmeasurable rather than pretending to check it.
 */
function resolve(value: string, tokens: Record<string, string>, depth = 0): Rgb | null {
  const raw = value.trim();
  if (depth > 8) return null;

  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return hexToRgb(raw);
  if (raw === "transparent") return null;

  const variable = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
  if (variable?.[1]) {
    const next = tokens[variable[1]];
    return next ? resolve(next, tokens, depth + 1) : null;
  }

  const mix = raw.match(
    /^color-mix\(in srgb,\s*(#[0-9a-fA-F]{6})\s+([\d.]+)%\s*,\s*([^)]+)\)$/,
  );
  if (mix?.[1] && mix[2] && mix[3]) {
    const weight = Number(mix[2]) / 100;
    const base = resolve(mix[1], tokens, depth + 1);
    const other = resolve(mix[3], tokens, depth + 1);
    if (!base || !other) return null; // e.g. mixed with transparent
    return base.map((channel, i) => Math.round(channel * weight + (other[i] ?? 0) * (1 - weight))) as Rgb;
  }

  return null; // oklab mixes, rgba, anything else we cannot measure honestly
}

function relativeLuminance([r, g, b]: Rgb): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

type Pair = {
  use: string;
  fg: string;
  bg: string;
  min: number;
  /** Pin the scope; defaults to the ink scope for SCOPED pairs, light otherwise. */
  scope?: Scope;
};

/** Pairs that resolve differently per scope (the ink band inverts surfaces). */
const SCOPED: Pair[] = [
  { use: "body text on the page", fg: "--orq-text-primary", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "body text on a card", fg: "--orq-text-primary", bg: "--orq-surface-white", min: AA_TEXT },
  { use: "secondary text on the page", fg: "--orq-text-secondary", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "secondary text on a card", fg: "--orq-text-secondary", bg: "--orq-surface-white", min: AA_TEXT },
  { use: "tertiary text on the page", fg: "--orq-text-tertiary", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "tertiary text on a card", fg: "--orq-text-tertiary", bg: "--orq-surface-white", min: AA_TEXT },
  // The product page is white and the marketing page is the pale mint tint, so
  // both, plus the neutral wash, are surfaces text can land on.
  { use: "body text on the neutral wash", fg: "--orq-text-primary", bg: "--orq-surface-secondary", min: AA_TEXT },
  { use: "secondary text on the neutral wash", fg: "--orq-text-secondary", bg: "--orq-surface-secondary", min: AA_TEXT },
  { use: "tertiary text on the neutral wash", fg: "--orq-text-tertiary", bg: "--orq-surface-secondary", min: AA_TEXT },
  { use: "body text on the brand tint", fg: "--orq-text-primary", bg: "--orq-surface-tint", min: AA_TEXT },
  { use: "secondary text on the brand tint", fg: "--orq-text-secondary", bg: "--orq-surface-tint", min: AA_TEXT },
  // The neon lime (#B8FF66) and the burnt orange (#E86A33) were retired, so a
  // mark is brand structure on a light surface and the pale tone inside a band.
  // Measured against every surface a mark actually lands on.
  { use: "brand mark on the page", fg: "--orq-mark-brand", bg: "--orq-surface-page", min: AA_UI },
  { use: "brand mark on a card", fg: "--orq-mark-brand", bg: "--orq-surface-white", min: AA_UI },
  { use: "brand text on the page", fg: "--orq-text-brand", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "brand text on a card", fg: "--orq-text-brand", bg: "--orq-surface-white", min: AA_TEXT },
  { use: "error text on the page", fg: "--orq-text-error", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "warm text on the page", fg: "--orq-text-warm", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "focus ring on the page", fg: "--orq-focus-ring", bg: "--orq-surface-page", min: AA_UI },
  { use: "focus ring on a card", fg: "--orq-focus-ring", bg: "--orq-surface-white", min: AA_UI },
  { use: "labels on the ink band", fg: "--orq-on-ink", bg: "--orq-ink", min: AA_TEXT },
  { use: "support text on the ink band", fg: "--orq-on-ink-muted", bg: "--orq-ink", min: AA_TEXT },
  // Status marks carry no label of their own, so each one is measured as a
  // drawn mark against the surface it sits on.
  { use: "active mark on the page", fg: "--orq-mark-active", bg: "--orq-surface-page", min: AA_UI },
  { use: "active mark on a card", fg: "--orq-mark-active", bg: "--orq-surface-white", min: AA_UI },
  { use: "warm mark on the page", fg: "--orq-mark-warm", bg: "--orq-surface-page", min: AA_UI },
  { use: "warm mark on a card", fg: "--orq-mark-warm", bg: "--orq-surface-white", min: AA_UI },
];

/** Pairs whose values are identical in every scope. */
const SHARED: Pair[] = [
  { use: "white label on a primary button", fg: "--orq-on-brand", bg: "--orq-brand-deep", min: AA_TEXT },
  { use: "white label on a secondary button fill", fg: "--orq-on-brand", bg: "--orq-brand", min: AA_TEXT },
  { use: "brand text on the contextual surface", fg: "--orq-brand-deep", bg: "--orq-brand-soft", min: AA_TEXT },
  { use: "secondary button text", fg: "--orq-brand-deep", bg: "--orq-surface-secondary", min: AA_TEXT },
  { use: "black label on the warm accent", fg: "--orq-on-warm", bg: "--orq-warm", min: AA_TEXT },
  { use: "white label on a destructive fill", fg: "--orq-on-error", bg: "--orq-error-fill", min: AA_TEXT },
  { use: "error text on its wash", fg: "--orq-text-error", bg: "--orq-error-soft", min: AA_TEXT },
  { use: "tertiary text on the disabled surface", fg: "--orq-disabled-text", bg: "--orq-disabled-surface", min: AA_TEXT },
  { use: "black label on the pale accent fill", fg: "--orq-ink", bg: "--orq-ink-accent", min: AA_TEXT },
];

/**
 * The console (the authenticated app) is a second design system living inside
 * the first: `.console` re-points every `--orq-*` token at `--console-*
 * primitives, and the light theme overrides only the primitives. Nothing above
 * measures it — SCOPED runs against `:root` and the ink band — which meant the
 * whole redesign palette was unchecked by the CI rule it wrote for itself. The
 * light console values in particular exist *because* they have to survive on
 * white (#5C9E31 lime, #E8761A orange, #C23B3B red), so the claim is worth
 * measuring rather than asserting.
 *
 * Each pair is printed for both themes on one line: the light column is the
 * one that fails when someone reaches for a brighter accent.
 */
const CONSOLE_PAIRS: Array<{ use: string; fg: string; bg: string; min: number }> = [
  { use: "body text on the page", fg: "--orq-text-primary", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "secondary text on the page", fg: "--orq-text-secondary", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "body text on a card", fg: "--orq-text-primary", bg: "--orq-surface-white", min: AA_TEXT },
  { use: "secondary text on a card", fg: "--orq-text-secondary", bg: "--orq-surface-white", min: AA_TEXT },
  { use: "body text on a raised row", fg: "--orq-text-primary", bg: "--orq-surface-secondary", min: AA_TEXT },
  { use: "secondary text on a raised row", fg: "--orq-text-secondary", bg: "--orq-surface-secondary", min: AA_TEXT },
  { use: "error text on the page", fg: "--orq-text-error", bg: "--orq-surface-page", min: AA_TEXT },
  { use: "error text on a card", fg: "--orq-text-error", bg: "--orq-surface-white", min: AA_TEXT },
  { use: "label on the primary CTA", fg: "--orq-on-warm", bg: "--orq-warm", min: AA_TEXT },
  { use: "label on a destructive fill", fg: "--orq-on-error", bg: "--orq-error-fill", min: AA_TEXT },
  { use: "focus ring on the page", fg: "--orq-focus-ring", bg: "--orq-surface-page", min: AA_UI },
  { use: "active mark on a card", fg: "--orq-mark-active", bg: "--orq-surface-white", min: AA_UI },
  { use: "warm mark on a card", fg: "--orq-mark-warm", bg: "--orq-surface-white", min: AA_UI },
  { use: "blocked mark on the page", fg: "--orq-error-fill", bg: "--orq-surface-page", min: AA_UI },
  { use: "chart lime on a card", fg: "--orq-chart-1", bg: "--orq-surface-white", min: AA_UI },
  { use: "chart warm on a card", fg: "--orq-chart-4", bg: "--orq-surface-white", min: AA_UI },
  // Info has no Tailwind utility yet, so it is named by its primitive.
  { use: "info mark on a card", fg: "--console-info", bg: "--console-surface", min: AA_UI },
  // `.text-muted` resolves through the shadcn alias --muted-foreground rather
  // than through --orq-text-secondary. The alias is declared at :root with its
  // refs substituted there, so inheriting it into the console silently carried
  // the marketing-light teal #356267 into BOTH themes — 2.85:1 on the dark
  // console, on the muted label used on every page. The console re-points it;
  // this pair is the regression guard.
  { use: "muted utility text on the page", fg: "--muted-foreground", bg: "--orq-surface-page", min: AA_TEXT },
  // Same defect family, one layer out: <body> carries `.text-foreground`, whose
  // value was substituted at :root (near-black), so every element inside the
  // console without its own text colour inherited black on #0B0F14. The console
  // sets `color` itself and re-points the alias; this is the guard.
  { use: "inherited body colour in the console", fg: "--foreground", bg: "--orq-surface-page", min: AA_TEXT },
  // `bg-muted` and `bg-brand-soft` are the two washes the pre-console pages
  // still lean on. They have to be surfaces body text can sit on in both
  // themes — not the marketing #F7F9F9 / #C2F2F2 blocks they used to be.
  { use: "body text on a muted chip", fg: "--orq-text-primary", bg: "--muted", min: AA_TEXT },
  { use: "body text on a brand-soft chip", fg: "--orq-text-primary", bg: "--orq-brand-soft", min: AA_TEXT },
  // `bg-brand-deep text-white` tiles (avatars, icon squares). The primitive
  // pair keeps the tile dark in both themes so the literal white label holds.
  { use: "tile label on a brand tile", fg: "--console-tile-text", bg: "--console-tile", min: AA_TEXT },
];

/**
 * Measure the console palette in both of its themes.
 *
 * The dark theme is `.console`; the light theme is the same block with the
 * primitives overridden by `.console[data-console-theme="light"]`, so the two
 * maps are built by layering rather than duplicating values — which also means
 * a new console primitive is measured as soon as both themes define it.
 */
function auditConsole(): number {
  const base = readTokens(readBlock(css, ":root {"));
  const dark = readVars(readBlock(css, ".console {"));
  const light = readVars(readBlock(css, '.console[data-console-theme="light"] {'));
  const themes = {
    dark: { ...base, ...dark },
    light: { ...base, ...dark, ...light },
  };

  let failed = 0;
  for (const pair of CONSOLE_PAIRS) {
    const columns: string[] = [];
    for (const theme of ["dark", "light"] as const) {
      const tokens = themes[theme];
      const fg = resolve(tokens[pair.fg] ?? "", tokens);
      const bg = resolve(tokens[pair.bg] ?? "", tokens);
      if (!fg || !bg) {
        // Unmeasurable is not a pass: a token that moved out of the maps is
        // exactly how this palette went unchecked, so it counts as a failure
        // and names the pair that stopped resolving.
        failed += 1;
        columns.push(`${theme} FAIL unmeasurable (${pair.fg} / ${pair.bg})`);
        continue;
      }
      const ratio = contrast(fg, bg);
      const ok = ratio >= pair.min;
      if (!ok) failed += 1;
      columns.push(
        `${theme} ${ok ? "pass" : "FAIL"} ${ratio.toFixed(2).padStart(5)}:1 [${toHex(fg)} on ${toHex(bg)}]`,
      );
    }
    const flag = pair.min === AA_TEXT ? "AA" : "UI";
    console.log(`  (${flag} >= ${pair.min})  ${pair.use}`);
    console.log(`        ${columns.join("   ·   ")}`);
  }
  return failed;
}

/**
 * The marketing page is the pale mint environment rather than the product's
 * white page, so every combination that lands on it is measured on its own.
 * Light scope only: the marketing page is never inside an ink band, and the
 * band inverts the text tokens, which would make these pairs meaningless there.
 */
const MARKETING: Pair[] = [
  { use: "body text on the marketing page", fg: "--orq-text-primary", bg: "--orq-brand-tint", min: AA_TEXT, scope: "light" },
  { use: "secondary text on the marketing page", fg: "--orq-text-secondary", bg: "--orq-brand-tint", min: AA_TEXT, scope: "light" },
  { use: "tertiary text on the marketing page", fg: "--orq-text-tertiary", bg: "--orq-brand-tint", min: AA_TEXT, scope: "light" },
  { use: "brand text on the marketing page", fg: "--orq-text-brand", bg: "--orq-brand-tint", min: AA_TEXT, scope: "light" },
  { use: "warm text on the marketing page", fg: "--orq-text-warm", bg: "--orq-brand-tint", min: AA_TEXT, scope: "light" },
  { use: "brand mark on the marketing page", fg: "--orq-mark-brand", bg: "--orq-brand-tint", min: AA_UI, scope: "light" },
  { use: "brand mark on a card over the marketing page", fg: "--orq-mark-brand", bg: "--orq-surface-white", min: AA_UI, scope: "light" },
];

/** The status system: each chip's label on its own fill. */
const STATUS_STATES = [
  "active",
  "working",
  "waiting",
  "blocked",
  "review",
  "done",
  "paused",
  "offline",
] as const;

const AUTHORITY_STATES = ["can", "spend", "approval", "cannot"] as const;
const MODE_STATES = ["manual", "assisted", "autonomous"] as const;

function generatedPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const state of STATUS_STATES) {
    pairs.push({
      use: `status "${state}" label on its chip`,
      fg: `--orq-status-${state}-text`,
      bg: `--orq-status-${state}-bg`,
      min: AA_TEXT,
    });
  }
  for (const state of AUTHORITY_STATES) {
    pairs.push({
      use: `authority "${state}" label`,
      fg: `--orq-authority-${state}-text`,
      bg: `--orq-authority-${state}-bg`,
      min: AA_TEXT,
    });
  }
  for (const state of MODE_STATES) {
    pairs.push({
      use: `agent mode "${state}" label`,
      fg: `--orq-mode-${state}-text`,
      bg: `--orq-mode-${state}-bg`,
      min: AA_TEXT,
    });
  }
  // Data marks need 3:1 against the surface they are drawn on to be readable.
  for (const series of ["1", "2", "3", "4", "5"]) {
    pairs.push({
      use: `chart series ${series} as a mark on the page`,
      fg: `--orq-chart-${series}`,
      bg: "--orq-surface-page",
      min: AA_UI,
    });
  }
  return pairs;
}

/**
 * A sequential ramp is not judged step-by-step against the surface: by design
 * its lightest step sits close to the page. What has to hold is that the ramp
 * is anchored (the darkest step clears 3:1 so the scale is readable) and that
 * every step is distinguishable from its neighbour.
 */
function auditRamp(tokens: Record<string, string>): number {
  const ramp = ["1", "2", "3", "4"].map((step) => `--orq-chart-ramp-${step}`);
  const surface = resolve(tokens["--orq-surface-white"] ?? "", tokens);
  if (!surface) return 0;

  let problems = 0;
  const darkest = resolve(tokens[ramp[3] ?? ""] ?? "", tokens);
  if (darkest) {
    const anchor = contrast(darkest, surface);
    const ok = anchor >= AA_UI;
    if (!ok) problems += 1;
    console.log(
      `  ${ok ? "pass" : "FAIL"}  ${anchor.toFixed(2).padStart(5)}:1  (UI >= ${AA_UI})  ramp anchored on a card  [${toHex(darkest)}]`,
    );
  }

  for (let i = 1; i < ramp.length; i += 1) {
    const previous = resolve(tokens[ramp[i - 1] ?? ""] ?? "", tokens);
    const current = resolve(tokens[ramp[i] ?? ""] ?? "", tokens);
    if (!previous || !current) continue;
    const step = contrast(previous, current);
    const ok = step >= 1.25;
    if (!ok) problems += 1;
    console.log(
      `  ${ok ? "pass" : "FAIL"}  ${step.toFixed(2).padStart(5)}:1  (step >= 1.25)  ramp step ${i} to ${i + 1} distinct  [${toHex(previous)} → ${toHex(current)}]`,
    );
  }
  return problems;
}

const css = readFileSync(CSS_PATH, "utf8");
// The ink band. Its selector list used to read `.ink, .bg-orq8-dark`; the
// historical utility retired with the compatibility bridge, so the band is
// matched on `.ink` alone.
const scopes: Record<Scope, Record<string, string>> = {
  light: readTokens(readBlock(css, ":root {")),
  ink: readTokens(readBlock(css, ".ink {")),
};

/**
 * The ink scope inherits anything it does not redeclare, so merge it over the
 * light tokens before measuring the band.
 */
scopes.ink = { ...scopes.light, ...scopes.ink };

console.log(`=== ORQ8 contrast audit (source: ${CSS_PATH}) ===`);

let failures = 0;
let unmeasurable = 0;

for (const pair of [...SCOPED, ...SHARED, ...MARKETING, ...generatedPairs()]) {
  // Shared, marketing and generated pairs use the light scope: they are either
  // identical in both or only ever composed in one.
  const scope: Scope = pair.scope ?? (SCOPED.includes(pair) ? "ink" : "light");
  const tokens = scopes[scope];
  const fg = resolve(tokens[pair.fg] ?? "", tokens);
  const bg = resolve(tokens[pair.bg] ?? "", tokens);

  if (!fg || !bg) {
    unmeasurable += 1;
    console.log(`  skip  (unmeasurable)  ${pair.use}  [${pair.fg} on ${pair.bg}]`);
    continue;
  }

  const ratio = contrast(fg, bg);
  const passes = ratio >= pair.min;
  if (!passes) failures += 1;
  const flag = pair.min === AA_TEXT ? "AA" : "UI";
  console.log(
    `  ${passes ? "pass" : "FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  (${flag} >= ${pair.min})  ${pair.use}  [${toHex(fg)} on ${toHex(bg)}]`,
  );
}

console.log("\n=== SEQUENTIAL RAMP ===");
failures += auditRamp(scopes.light);

console.log("\n=== CONSOLE (the authenticated app) ===");
failures += auditConsole();

// Report the light scope separately so a light-only failure is obvious.
console.log("\n=== REQUIRED — light scope ===");
for (const pair of SCOPED) {
  const tokens = scopes.light;
  const fg = resolve(tokens[pair.fg] ?? "", tokens);
  const bg = resolve(tokens[pair.bg] ?? "", tokens);
  if (!fg || !bg) continue;
  const ratio = contrast(fg, bg);
  const passes = ratio >= pair.min;
  if (!passes) failures += 1;
  console.log(`  ${passes ? "pass" : "FAIL"}  ${ratio.toFixed(2).padStart(5)}:1  ${pair.use}`);
}

console.log(
  `\n=== COLOR AUDIT RESULT: ${
    failures === 0
      ? `pass — every required pair clears its threshold${unmeasurable ? ` (${unmeasurable} unmeasurable, listed above)` : ""}`
      : `${failures} required pair(s) below threshold`
  } ===`,
);

process.exit(failures === 0 ? 0 : 1);
