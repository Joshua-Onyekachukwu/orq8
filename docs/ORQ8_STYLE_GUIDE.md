# ORQ8 Design & Contrast Style Guide

Reference for every future UI change. The rule set below is enforced in CI by
`apps/web/scripts/contrast-check.mjs` (`pnpm --filter @orq8/web test:contrast`).

---

## 1. The Absolute Rule

> **Light surface → dark readable text. Dark surface → light readable text.**

Every text node, label, caption, icon, badge and tooltip must clear **WCAG AA**:

- Normal text (≤ 18px, not bold): **≥ 4.5:1**
- Large text (≥ 18.66px bold or ≥ 24px): **≥ 3:1**
- Icons that convey information: **≥ 3:1** against their background
- UI component boundaries (inputs, card borders): **≥ 3:1** (they must be
  distinguishable; faint hairline borders on white are decorative, not boundaries)

Secondary/muted text is NOT exempt. "1 total", "0 completed", "0% used",
"This week" must be as readable as the big number next to them.

---

## 2. Semantic tokens (source of truth: `apps/web/app/globals.css`)

| Token | Value (light) | Value (dark) | Use |
| --- | --- | --- | --- |
| `--foreground` / `text-ink` | `#0a0a0b` | `#f2efe9` (parchment) | Primary text |
| `--muted-foreground` / `text-muted` | `#737373` (4.74:1 on white) | `#97929e` (fog) | Secondary/muted text, card descriptions, captions |
| `--color-ink-muted` / `text-ink-muted` | `#525252` (7.8:1 on white) | — | Secondary text on light surfaces |
| `--color-ink-faint` | `#a3a3a3` (~2.5:1 on white) | — | **BANNED as text on light surfaces** (kept only for dark-surface tints) |
| `--muted` / `bg-muted` | `#f5f5f5` | `#14141d` (panel) | Muted *background* — never text |
| `--card` / `bg-card` / `bg-white` | `#ffffff` | `#0e0e15` (abyss) | Card surfaces |
| `--background` | white | `#0a0a0f` (void) | Page background |
| `text-orq8-orange` | `#b84a1e` (≥4.5:1 on white) | — | Accent text on light surfaces |
| `text-orq8-orange-bright` | — | `#E86A33` (~6:1 on dark) | Accent text on dark surfaces |
| `text-orq8-green` | `#1a5c2e` | — | Brand text on light surfaces |
| `text-orq8-lime` / `text-white` | — | — | Text on dark/navy/lime surfaces |

### The `text-muted` hazard (why this guide exists)

Tailwind v4's `@theme inline` maps `--color-muted` to the **background** shade
(`#f5f5f5`), so `text-muted` would paint text with a near-white color — invisible
on cards. `globals.css` carries unlayered overrides that re-map `text-muted` (and
its hover/opacity variants) to `--muted-foreground` (#737373). **Never remove or
"clean up" those overrides.** The contrast-check test verifies them.

---

## 3. Light mode

- Primary text: `text-ink` (`#0a0a0b`)
- Secondary text: `text-ink-muted` (`#525252`) or `text-muted` (`#737373`)
- Placeholder text: `placeholder:text-muted-foreground`
- Disabled text: use the same muted tokens (never `opacity-*` on text that must
  remain legible; disabled controls may drop to `disabled:opacity-50` only when
  the state is also conveyed by non-color cues)
- Brand accents on white: `text-orq8-orange` (`#b84a1e`), `text-orq8-green` (`#1a5c2e`)

**Do not use:** `text-gray-200/300/400`, `text-ink-faint`, or any color under
~4.5:1 on white for text or information-carrying icons.

## 4. Dark mode (`.dark` / navy / void surfaces)

- Primary text: `text-parchment`-equivalent (`--foreground`)
- Muted text on dark: `text-muted` (resolves to fog `#97929e`, ~6:1 on panel)
- `text-orq8-muted-on-dark` (`rgba(255,255,255,0.5)`), `text-orq8-faint-on-dark`
  (`rgba(255,255,255,0.3)`) are for dark surfaces only
- Brand accents on dark: `text-orq8-lime` (`#B8FF66`), `text-orq8-orange-bright` (`#E86A33`)

**Do not use:** dark text (ink/navy/gray-700+) on dark surfaces.

## 5. Status colors

- `--success` `#10b981`, `--warning` `#f59e0b`, `--danger` `#ef4444`, `--info` `#3b82f6`
- Status **text** must clear AA on its badge background (e.g. `text-emerald-700`
  on `bg-emerald-50`, `text-red-700` on `bg-red-50`).
- Never communicate status by color alone — pair with a label/icon.

## 6. Buttons & interactive states

- Primary buttons: `bg-orq8-green text-white` (dark green surface → white text)
- Lime CTAs on dark: `bg-orq8-lime text-navy-950`
- Hover/focus must not flip contrast: when a background changes on hover, verify
  the foreground still clears AA (this was a real failure class).

## 7. Prohibited patterns

1. `text-white` on white/light cards (the dashboard metric-label bug)
2. `text-muted` reverting to `--muted` (the token collision this guide documents)
3. `text-ink-faint`, `text-gray-200`, `text-gray-300`, `text-gray-400` on light
   surfaces (banned by the CI scan; the only allowance is the decorative `·`
   separator in `components/top-bar.tsx`)
4. Arbitrary inline colors (`text-[#eee]`, `bg-[#fff]`) instead of tokens
5. Random gradients, purple/blue AI-styling, excessive glassmorphism

## 8. Correct examples

```tsx
{/* Card secondary text — readable on white */}
<p className="text-xs text-muted">1 total</p>

{/* Icon-only button — accessible name + visible icon */}
<button aria-label="Close" className="text-ink-muted hover:text-ink">
  <X className="h-4 w-4" />
</button>

{/* Status badge — AA pairing */}
<span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Healthy</span>

{/* Dark surface — light text */}
<button className="bg-orq8-green text-white hover:bg-orq8-green-dark">Continue</button>
```

## 9. Verification

- `pnpm --filter @orq8/web test:contrast` — token-resolution math + banned-class scan
- Build: `pnpm --filter @orq8/web build`
- Manual: check dashboard metric cards, admin pages, modals, dropdowns, tables,
  empty states, hover states, dark mode, mobile viewports