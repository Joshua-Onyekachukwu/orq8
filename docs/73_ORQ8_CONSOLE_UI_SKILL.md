# 73 — Console UI Skill (implementation guardrail)

**Read this before touching any `/app` screen.** It is the practical companion to
`docs/71` §N (design system), `docs/70` (headquarters design) and
`docs/ORQ8_STYLE_GUIDE.md` (contrast). Where they describe intent, this file
describes the **mechanics that already exist** and the rules that keep the
console from drifting into generic, "AI-slop" UI.

Status: ACTIVE (2026-10-01). Applies to every screen under `apps/web/app/app/`.

---

## 1. The one idea

The console re-skins itself. You almost never write a colour.

`apps/web/app/app/layout.tsx` wraps the whole authenticated shell in
`<div className="console" data-console-theme={theme}>`. Inside that scope,
`globals.css` re-points every `--orq-*` token at the console palette. So an
existing component that says `bg-white`, `text-ink`, `border-hairline`,
`bg-warm-soft` **already** renders as the dark console without a single call-site
edit — and flips to the light console when the founder toggles.

Corollary: adding a colour by hand is the drift. If a screen looks wrong, the fix
is a token or a shared class, not a new hex value.

## 2. Tokens (never hardcode)

Dark console — locked:

| Role | Value | Utility |
| --- | --- | --- |
| Page background | `#0B0F14` | `bg-canvas` |
| Card / surface | `#11161D` | `bg-white`, `bg-elevated`, `.console-card` |
| Hover / secondary | `#161D26` | `bg-surface-secondary` |
| Hairline | `#1E2732` | `border-hairline` |
| Hairline strong | `#2A3646` | `border-hairline-strong` |
| Primary | `#E6EAF0` | `text-ink` |
| Muted | `#97A3B4` | `text-muted` |
| Lime (ok / active) | `#A6CE95` | `text-brand-ink`, `bg-brand-deep` |
| Orange (needs you) | `#E9974F` | `bg-warm`, `text-warm-ink`, `text-on-warm` |
| Red (blocked / failed) | `#E07A7A` | `text-error-ink`, `bg-error-soft` |
| Info | `#8FB8D8` | `var(--orq-info)` (no Tailwind utility yet) |
| Label on orange | `#231206` | `--console-on-orange` → `text-on-warm` |
| Label on red | `#231206` | `--console-on-red` → `--orq-on-error` |

Light console is the same token names with the light pair (`#FFFFFF` / `#F7F8FA`
/ `#EEF1F4` / `#E3E8EE` / `#5C9E31` / `#DC6D14` / `#C23B3B`), plus
`--console-on-red: #FFFFFF`.

**Two light values are measured, not chosen by eye** (`pnpm audit:contrast`,
which now covers both console themes):

- Light orange is `#DC6D14`, four percent deeper than the originally written
  `#E8761A`, because `#E8761A` draws a state dot at **2.81:1** on a light card —
  under the 3:1 a drawn mark needs, i.e. the "needs you" signal quietly
  disappearing on white. `#DC6D14` measures 3.17:1 and is indistinguishable as
  a fill.
- Label-on-red is a **separate primitive** from label-on-orange. The two
  themes' reds are opposite weights (dark's `#E07A7A` is pale, light's
  `#C23B3B` is deep), so one shared label value cannot serve both: near-black
  on the light red measured 3.43:1.

Source of truth:
`packages/core/src/design-tokens.ts` (`CONSOLE_DARK`, `CONSOLE_LIGHT`) with a
local mirror in `apps/web/lib/console-theme.ts` (the web app must not import
`@orq8/core` — it drags pino into the client bundle).

## 3. Colour discipline — the anti-slop rule

**Colour is a state signal, not decoration.**

- Lime = healthy / active / done. Orange = something needs the founder. Red =
  blocked, failed, expired. Grey = inert.
- Exactly **one** primary CTA per screen (orange fill, `text-on-warm`). Every
  other action is ghost (`border-hairline-strong`, transparent) or tertiary.
- Decisions use the ghost pair: Reject = transparent red outline
  (`.btn-ghost-danger`), Approve = transparent white outline (`.btn-ghost-white`).
- Never introduce a fourth hue. Never use a gradient, a glow, a drop shadow
  beyond the one modal shadow, or an emoji as an icon.
- Never rely on colour alone: pair it with a `state-dot` and a word.

## 4. Existing primitives — use them, don't reinvent

| Need | Use |
| --- | --- |
| Card | `.console-card` (surface + hairline + 10px radius) |
| Status dot | `<span className="state-dot" data-state="working\|waiting\|blocked\|" />` |
| Chat/command composer | `.console-composer` |
| EA identity mark | `.ea-avatar` |
| Ghost reject / approve | `.btn-ghost-danger` / `.btn-ghost-white` |
| Page shell + error boundary | `<PageShell pageName backHref>` |
| Empty state | dashed `border-hairline` box + one line of instruction + one action |

`state-dot` states map to the product vocabulary: `working` (lime, pulsing),
`waiting` (orange — needs the founder), `blocked` (red), none/other (grey).

## 5. Typography and density

- Page title `text-2xl font-semibold tracking-tight text-ink`, one line of
  `text-sm text-muted` under it. No tagline longer than one sentence.
- Eyebrows/labels: `font-mono text-2xs font-semibold uppercase tracking-wide
  text-muted`.
- Numbers: `tabular-nums`. Credits are whole numbers, money is `$0.00`, health is
  `/100`.
- Body copy never exceeds ~2xl measure; a section earns its heading.
- Density beats decoration: if a card has no data, it says so in one line.

## 6. Honesty rules (the strongest anti-slop rule in this product)

1. **No invented data.** Every number comes from an endpoint. There is no demo
   fallback in the console.
2. **Empty states instruct.** "No work yet" + how to get work, not a shrug.
3. **Zero is a fact, not a failure.** Finance shows `$0.00` and says "No real
   money has moved yet" rather than hiding.
4. **A broken upstream must not read as zero.** If a fetch fails, show the
   failure or the boundary — never a confident `0`, and never `NaN`.
5. **`NaN`, `undefined`, `null%`, `[object Object]` in rendered text is a P0
   defect.** Two of these shipped in the departments page because a field was
   missing from an API response and the UI guessed. `scripts/content-audit.mjs`
   now fails the build on all of them.

## 7. Responsive

Full-width content inside the shell (`p-4 sm:p-6 lg:p-7`), no 1280px cap. Board
grids go 3 columns at `lg`, 4 (with the detail rail) at `xl`. The EA is reachable
from every operational page (the dock) within one interaction. Verify at 1440,
1280, 1024 and 768; a horizontal scrollbar is a bug.

## 8. The check before you ship a screen

1. `pnpm --filter @orq8/web typecheck` — clean.
2. `pnpm audit:contrast` — clean. This is the CI contrast rule, and it measures
   **both console themes** as well as the marketing palette. (An earlier version
   of this checklist named a `test:contrast` script that has never existed, and
   the audit itself did not read the console tokens — so the entire redesign
   palette was unmeasured while this file claimed otherwise. If a checklist step
   has never been run, it is not a step.)
3. `node scripts/scan-rsc-boundary.mjs` — no server file imports a function from
   a `"use client"` module (this is what crashed the dashboard: a server page
   called `computeScore()` from a client component).
4. `node scripts/route-sweep.mjs --base <url>` — every route loads clean.
5. `node scripts/content-audit.mjs --base <url>` — no `NaN`/`undefined`/`null%`/
   `[object Object]` in rendered text.
6. Look at it. Screenshot the page at 1440 and read it as the founder would.

## 9. Known drift to watch

- `bg-white` is a compatibility shim (`.console .bg-white` → console surface).
  New code should use `bg-elevated`/`.console-card`; migrate `bg-white` call
  sites as you touch them.
- The sidebar used to be permanently ink-black; it now follows the theme via
  `bg-elevated` + `text-ink`/`text-muted`. Keep it that way.
- `/app/skin-preview` is a live harness for the two palettes. It is a developer
  surface, not a product page.
- **Never import a value from a `"use client"` module into a server file.**
  Components may cross that boundary; plain values may not. The theme cookie
  NAME was exported from `theme-toggle.tsx` and read by `app/app/layout.tsx`, so
  the server received a client reference instead of a string, the lookup always
  missed, and every page load silently discarded the founder's light-mode choice
  — it looked perfectly wired. `node scripts/scan-rsc-boundary.mjs` now flags
  constants as well as functions.
- **A `:root`-declared alias keeps the `:root` value, wherever it is used.**
  `--muted-foreground: var(--orq-text-secondary)` was declared at `:root`; the
  `var()` is substituted at the declaring element, so inheriting it into
  `.console` carried the marketing-light teal `#356267` into both console
  themes. `.text-muted` was therefore **2.85:1 on the dark console** — on the
  secondary text of every page — while the token audit saw nothing, because the
  utility resolves through an alias the console never re-pointed. `.console`
  now re-points it, and `color-contrast-audit.ts` measures that exact pair and
  treats an unmeasurable pair as a failure. When you add a console primitive,
  re-point the alias too — or the alias wins.
