# 65 — Color System

**Product:** ORQ8 — AI Organization Operating System
**Status:** Implemented in `apps/web/app/globals.css` · measured by `scripts/color-contrast-audit.ts` · rendered at `/design/colors`
**Supersedes:** the four competing palettes that previously lived in that one file, the green/orange identity, and the interim green/ochre v2 palette (nothing escaped interim — see §8).
**Related:** `docs/33_UI_UX_SYSTEM.md` §33.11, `marketing/DESIGN_DIRECTION.md` (typography, grid, motion).

---

## 0. The audit that preceded this

Before a value was defined, the existing values were extracted from the codebase. `apps/web/app/globals.css` contained **four palettes stacked in one file**, plus hand-written utility classes carrying a second palette of their own.

| Layer | What it was | Verdict |
|---|---|---|
| Light semantic layer | `--color-canvas: #fafafa`, `--color-ink: #0a0a0b`, `--color-gray-500: #64748b` | Load-bearing. Its *names* survive; the arbitrary gray values do not. |
| "Navy" brand scale | `--color-navy-950 … 600` were really a green ramp: `#0a0a0b → #0d1a12 → #1a5c2e → #2d7a42 → #4a9d62`. The name said navy; the values were forest green. | Retired onto surface and brand tokens. |
| Neon accent | `--color-lime: #B8FF66` | **Banned.** This is the "hacker green on black" family. |
| Editorial dark set | `--color-void/abyss/panel/parchment/fog/ember` | Collapsed into the single system. |
| Deprecated numeric scales | `primary-*`, `secondary-*`, `success-*`, `warning-*`, `danger-*`, `orange-*`, `gray-*`, `amber` | **Deleted.** Nothing referenced them, and they were a second palette. |
| ~40 hand-written `.orq8-*` classes | `#1a5c2e`, `#B8FF66`, `#b84a1e`, `#E86A33`, hard-coded | Registered as theme colours, then retired onto semantic tokens (§7). |

Eight things were **broken, banned, or invisible**, and each is now fixed:

1. **A dead `.dark` block.** `next-themes` is imported by `components/ui/sonner.tsx` alone and **no `ThemeProvider` is ever mounted**, so `.dark` was never applied and every `dark:` style in the codebase was inert.
2. **`--color-success-500: #37d80a`** — a full neon-green ramp (`#eeffe5 → #1a5710`) used for "positive". The banned fintech money-green.
3. **`--color-amber: #f59e0b` and `--color-warning: #f59e0b`** — Tailwind's stock amber, doing double duty as decoration and as a warning.
4. **`--color-danger: #ef4444`**, `#c14f1f`, `#E86A33` — three warm hues competing for "attention".
5. **~165 off-palette hue call sites**: `blue` (86), `indigo` (33), `purple` (23), `rose` (10), `cyan`, `violet`, `pink`, `sky`, `teal`. A rainbow status system.
6. **The logo glyph defaulted to `#605DFF`** — indigo, the borrowed AI-purple — and the app header overrode it with `#B8FF66`.
7. **`bg-orq8-dark/95` silently emitted nothing.** The `.orq8-*` names were hand-written CSS, so Tailwind could not generate opacity modifiers from them. The cookie banner had no background at all; it only *looked* dark over the black hero.
8. **A purple navbar shadow** (`rgba(146,139,221,…)`), a lavender image shadow, an emerald hero glow, and neon-lime glows on the pricing cards and the hub core.

Net effect before: the marketing site was white-with-neon-lime, the auth shell was dark green, and the app was off-white with slate greys. "One identity" was not true.

---

## 1. The rules

1. **Colour is infrastructure for meaning, not decoration.** It marks state, hierarchy, attention, success and action, and nothing else.
2. **One token layer, one palette.** Every colour is declared once in `:root`. Components reach a colour through a token or not at all.
3. **The interface is light-first.** Black is a *structural band*, never a theme. Roughly 70%+ of any screen is `#EFFEFB` / `#FFFFFF`.
4. **Teal carries the brand weight; nothing else competes with it.** `#356267` for primary structure, `#41737C` for support.
5. **The warm accent is rare.** `#F1C095` marks a human moment. It is not a second brand colour.
6. **Red only ever means error.** Approval is not failure.
7. **Status survives grayscale.** Glyph and label first, colour second (§5).
8. **Departments and agents do not get personality colours.** They are distinguished by icon, name, hierarchy, layout and label — a system represents one company.
9. **When choosing between two values, pick the duller one**, and test it on the landing page first.

### Banned

Purple → blue / violet → cyan "AI gradients" · indigo or violet anywhere · cyan or electric glow · neon-on-black · generic SaaS blue (`#3B82F6` / `#6366F1`) · glassmorphism blur stacks · rainbow categorical palettes · gradients as decoration · bright "money green" badges (`#22C55E` family) · arbitrary gray systems · a second green · wood/finance semaphore colours invented per component.

---

## 2. The palette

```text
Core brand        #356267   #41737C
Interface         #FFFFFF   (the page, and the cards on it)
Contextual        #C2F2F2   #EFFEFB
Structural        #000000
Warm              #F1C095
Accents           #B8FF66   #E86A33
Error             #D55053
```

Everything else in §3 is *derived* from these, and every derivation is documented and measured.

**The page is white.** It was `#EFFEFB` for one revision, which read as a product sitting in a green-tinted room. A tinted page also collapses the hierarchy: if the page is already tinted, cards and washes have nothing to rise above, so more tint gets used to compensate and the interface drifts toward one colour. White page, white cards, a hairline and a shadow between them, and colour reserved for meaning.

**The accents are touches, never surfaces.** They exist so the interface has two points of vivid life: a lime rule over a step, a lime tick beside an eyebrow, a lime dot on a black band, the orange pricing ribbon, an orange marker on a status pill. They never fill a card, never become a button, and are never body text — see the derived ink tones in §3.

---

## 3. Token table

Declared in `apps/web/app/globals.css`, in `:root`. Contrast figures are **measured**, not asserted — see §10.

### Brand

| Token | Value | Semantic use |
|---|---|---|
| `--orq-brand-deep` | `#356267` | Primary structural colour. Primary buttons, active navigation, selected structures, important links, strong accents. Carries the brand weight. |
| `--orq-brand` | `#41737C` | Supporting: hover states, secondary actions, secondary controls, secondary charts. Never competes with brand-deep. |
| `--orq-brand-hover` | `#2B5054` | Pressed state for brand-deep. Derived. |
| `--orq-brand-soft` | `#C2F2F2` | Selected, contextual and informational surfaces. |
| `--orq-brand-tint` | `#EFFEFB` | The palest brand tint. A small contextual surface, not a page. |
| `--orq-on-brand` | `#FFFFFF` | Labels on a brand fill. |

### Surfaces

| Token | Value | Semantic use |
|---|---|---|
| `--orq-surface-page` | `#FFFFFF` | The page. Product, marketing and admin alike. |
| `--orq-surface-white` | `#FFFFFF` | Cards, modals, dropdowns, forms, tables, dialogs — separated from the page by `--orq-border` and a soft shadow, not by a tint. |
| `--orq-surface-secondary` | brand @ 4% on white | The neutral wash: input fields, hover states, selected rows, table stripes, quiet panels. |
| `--orq-surface-tint` | `#EFFEFB` | The palest brand tint, for the few small surfaces that genuinely want it. |
| `--orq-ink` | `#000000` | Structural black band. |
| `--orq-overlay` | black @ 48% | Modal scrim. |

Because the page is white, `bg-surface-page` is no longer a usable surface: as a hover or a field background it is a no-op. Those call sites were repointed to `--orq-surface-secondary`.

### Accents

| Token | Value | Semantic use |
|---|---|---|
| `--orq-accent-lime` | `#B8FF66` | The lime touch as a fill or a mark. 1.20:1 on white, so never text and never a surface. |
| `--orq-accent-lime-ink` | `#527A00` | Lime as a mark or a small label on light (5.07:1). Inside a band it reverts to `#B8FF66`. |
| `--orq-accent-orange` | `#E86A33` | The orange touch as a fill or a mark (3.17:1 on white). |
| `--orq-accent-orange-ink` | `#B4470F` | Orange as a mark or a small label on light (5.49:1). Inside a band it reverts to `#E86A33`. |

A fill carrying a label uses the vivid tone with black: black on `#B8FF66` is 17.5:1 and black on `#E86A33` is 6.6:1, so a black label is always the right label on an accent.

### Text

| Token | Value | Semantic use |
|---|---|---|
| `--orq-text-primary` | `#000000` | Headings, strong text, important labels, major metrics. |
| `--orq-text-secondary` | `#356267` | Secondary text, supporting labels, table sub-copy. |
| `--orq-text-tertiary` | `#487279` | Metadata only. Derived from the brand hue; clears AA on white and on the neutral wash. |
| `--orq-text-inverse` | `#FFFFFF` | Text on dark. |
| `--orq-text-brand` | `#356267` | Links and brand text. |
| `--orq-text-warm` | `#7A4F1E` | Attention text. Derived: `#F1C095` cannot be text at all (1.6:1). |
| `--orq-text-error` | `#A83B3E` | Error text. Derived: `#D55053` only reaches 4.0:1 as text. |

### Borders

| Token | Value | Semantic use |
|---|---|---|
| `--orq-border` | brand @ 18% on the page | Hairlines and dividers. Derived from the brand hue, never an arbitrary gray. |
| `--orq-border-soft` | brand @ 9% | Whisper-level separators. |
| `--orq-border-strong` | `#356267` | Control borders, emphasised boundaries. |
| `--orq-border-selected` | `#41737C` | Selected state. |
| `--orq-border-error` | `#D55053` | Invalid fields. |

### Interactive

| Token | Value | Semantic use |
|---|---|---|
| `--orq-focus-ring` | `#41737C` | Keyboard focus. Must clear 3:1 on its surface or focus is invisible. |
| `--orq-disabled-surface` | brand @ 7% | Disabled fill. |
| `--orq-disabled-text` | `#47696F` | Disabled label. Stays at AA: a control is de-emphasised by its surface and a reduced-opacity treatment, never by pushing its label below legibility. |

### Warm accent and error

| Token | Value | Semantic use |
|---|---|---|
| `--orq-warm` | `#F1C095` | The human moment: Founder's attention, a milestone, a non-critical highlight. |
| `--orq-warm-deep` | `#E0A878` | Warm pressed state. Derived. |
| `--orq-warm-soft` | warm @ 34% on white | Warm wash. |
| `--orq-on-warm` | `#000000` | Labels on a warm fill. |
| `--orq-error` | `#D55053` | Error accents, icons, borders. |
| `--orq-error-fill` | `#C4434A` | A destructive fill carrying a white label. Derived: white on `#D55053` is 4.12:1 and fails AA. |
| `--orq-error-soft` | error @ 10% on white | Error wash. |
| `--orq-on-error` | `#FFFFFF` | Labels on an error fill. |

### Status

Each state is a **background / text pair**, so a chip reads at a glance.

| State | Background | Text | Meaning |
|---|---|---|---|
| ACTIVE | `#C2F2F2` | `#356267` | Active and healthy. |
| WORKING | `#EFFEFB` | `#41737C` | Under way now. Motion shows through an indicator, not more colour. |
| WAITING | `#F1C095` | `#000000` | Attention may be needed; this is not an error. |
| BLOCKED | `#C4434A` | `#FFFFFF` | The work genuinely cannot continue. |
| REVIEW | `#C2F2F2` | `#356267` | Needs eyes, not a decision. Distinguish from ACTIVE with icon and label. |
| DONE | `#EFFEFB` | `#356267` | Complete, without inventing another green. |
| PAUSED | `#C2F2F2` | `#356267` | Deliberately stopped. Use reduced emphasis so it never reads as ACTIVE. |
| OFFLINE | `#000000` | `#FFFFFF` | An agent, integration or service is unavailable. |

### Status marks

A status **chip** is a fill carrying its own label. A status **mark** is the small live dot beside a label — a health light, a progress fill, an unread pip — and it has no text to carry it. The pale chip tones vanish against the page (`#C2F2F2` is 1.17:1 on white, `#F1C095` is 1.59:1), so a mark is the dark tone on the light surface and the pale tone inside a band. One name, correct in both scopes.

| Mark | Light | In an ink band | Use |
|---|---|---|---|
| `--orq-mark-active` | `#356267` | `#C2F2F2` | Live, running, connected, healthy. |
| `--orq-mark-warm` | `#C08453` | `#F1C095` | Paused, waiting, needs attention. |
| `--orq-error-fill` | `#C4434A` | `#C4434A` | Failed. Dark enough to be its own mark in either scope. |

A mark that sits on a deliberately dark card *outside* a band uses `--orq-ink-accent`, which is always the pale tone.

### Authority and agent mode

| Authority | Background | Text |
|---|---|---|
| CAN DO | `#C2F2F2` | `#356267` |
| CAN SPEND | `#41737C` | `#FFFFFF` |
| REQUIRES APPROVAL | `#F1C095` | `#000000` |
| CANNOT DO | `#C4434A` | `#FFFFFF` |

| Agent mode | Surface | Text | Border |
|---|---|---|---|
| MANUAL | `#FFFFFF` | `#000000` | `#356267` |
| ASSISTED | `#C2F2F2` | `#356267` | — |
| AUTONOMOUS | `#356267` | `#FFFFFF` | — |

The progression communicates increasing system autonomy through depth, not through three unrelated colours.

### Charts

| Token | Value | Use |
|---|---|---|
| `--orq-chart-1` | `#356267` | Primary series. |
| `--orq-chart-2` | `#41737C` | Secondary series. |
| `--orq-chart-3` | `#5E959C` | Supporting series. Derived from `#C2F2F2`. |
| `--orq-chart-4` | `#C08453` | Highlight. Derived from `#F1C095`. |
| `--orq-chart-5` | `#D55053` | Negative and error series only. |
| `--orq-chart-band-3/4` | `#C2F2F2` / `#F1C095` | Labelled **area and band** fills, where the region is annotated rather than read as a mark. |
| `--orq-chart-ramp-1…4` | `#C2F2F2 → #7FB5BC → #41737C → #356267` | The sequential ramp for magnitude. |

Series 3 and 4 are darkened from the palette's own values because a drawn mark has to clear 3:1 against the page: `#C2F2F2` on `#EFFEFB` is 1.17:1 and `#F1C095` is 1.59:1 — invisible. A mark you cannot see is not accessible, so the verbatim values live on the band tokens instead.

### The ink band

| Token | Value | Use |
|---|---|---|
| `--orq-ink` | `#000000` | The band. |
| `--orq-on-ink` | `#FFFFFF` | Labels. |
| `--orq-on-ink-muted` | `#C2F2F2` | Supporting text. |
| `--orq-ink-accent` | `#C2F2F2` | Accent inside a band. |

---

## 4. Usage map

### The application

| Surface | Tokens |
|---|---|
| Page | `--orq-surface-page`; body text `--orq-text-primary` |
| Sidebar / top bar | `--orq-surface-white`, active row `--orq-surface-secondary`, inactive label `--orq-text-secondary`, divider `--orq-border` |
| Cards, tables, forms, modals | `--orq-surface-white` on the page, `--orq-border` hairlines, `--orq-text-primary` / `--orq-text-secondary` |
| Selected row, active filter, contextual block | `--orq-surface-secondary` |
| Company Hub canvas | An ink band: `--orq-ink`, orbit rings on `--orq-border`, core keyline on `--orq-ink-accent`, satellite cards on the band's raised surface |
| Executive Agent | `--orq-brand-deep` header, `--orq-brand-soft` EA turns, `--orq-text-primary` transcript, `--orq-focus-ring` composer |
| Founder's Attention | `--orq-warm-soft` wash, `--orq-warm` border, `--orq-text-warm` label. The only warm moment at section scale. |
| Work status | The status pair from §3, always with a glyph and a word |
| Charts and reports | `--orq-chart-*`; the ramp for magnitude; band tokens for annotated areas |
| Destructive confirmation | `--orq-error-fill` button, `--orq-error-soft` wash, `--orq-text-error` label |
| Empty / loading / error states | Empty: `--orq-border` dashed + `--orq-text-muted`. Loading: `--orq-brand-soft` skeleton. Error: `--orq-error-soft` + `--orq-text-error`. |

### Marketing, auth, emails

| Surface | Tokens |
|---|---|
| Landing page | `--orq-surface-page` body, `#FFFFFF` sections for hierarchy, `--orq-text-primary` headings, `--orq-text-secondary` support |
| Landing hero / CTA bands | An ink band: `--orq-ink`, `--orq-on-ink`, `--orq-ink-accent`; primary action `--orq-brand-deep` with `--orq-on-brand` |
| Primary CTA | `--orq-brand-deep` fill, white label; hover `--orq-brand` |
| Secondary CTA | `--orq-surface-secondary` fill, `--orq-brand-deep` label |
| Pricing | `#FFFFFF` plans on the page, `--orq-brand-deep` on the recommended plan only, `--orq-warm` badge with a black label |
| Auth | Ink band shell, `--orq-brand-deep` brand panel, `--orq-ink-accent` eyebrow and focus, `--orq-on-ink` headings |
| Emails | `--orq-ink` background, `--orq-on-ink` body, one `--orq-brand-deep` button. No warm, no error: an email cannot carry a live state. |

---

## 5. The status vocabulary

Status survives grayscale, so the glyph carries the meaning and the colour reinforces it.

| State | Glyph | Background / text |
|---|---|---|
| Active | `●` | `--orq-status-active-bg` / `-text` |
| Working | `◍` | `--orq-status-working-bg` / `-text` |
| Waiting | `!` | `--orq-status-waiting-bg` / `-text` |
| Blocked | `✕` | `--orq-status-blocked-bg` / `-text` |
| Review | `◐` | `--orq-status-review-bg` / `-text` |
| Done | `✓` | `--orq-status-done-bg` / `-text` |
| Paused | `Ⅱ` | `--orq-status-paused-bg` / `-text`, reduced emphasis |
| Offline | `—` | `--orq-status-offline-bg` / `-text` |

Never encode state by colour alone. A monochrome screenshot of the dashboard must still be readable.

---

## 6. Do / don't

**Do**

- Reach every colour through a token: `bg-surface-white`, `text-ink-muted`, `border-hairline`, `bg-brand-deep`, `bg-orq8-green`, `text-status-waiting-text`.
- Let the page breathe. Teal is 15–20% of the screen at most; `#C2F2F2` 5–10%; the warm accent under 5%; red only where something is actually wrong.
- Pair every status colour with a glyph and a word.
- Use the ink band for the footer, a major CTA, a product statement, and the hub canvas.
- Distinguish departments and agents with icon, name and structure.

**Don't**

- Don't write a hex value in a component.
- Don't make everything teal. The hierarchy — page, white, contextual, brand, warm, error — is the system.
- Don't spend red on anything that is not an error or a destruction; approval is not failure.
- Don't give each department or agent its own colour.
- Don't use the warm accent for every button, badge or card.
- Don't painstakingly distinguish "healthy" with a fourth hue. Healthy is the brand; attention is warm; trouble is error.
- Don't add blue, purple, violet, neon or a decorative gradient.

---

## 7. How the theme works

```css
:root           { /* the whole system. Light-first. */ }
.theme-light    { /* removed — light is the default, not a scope */ }
.ink            { /* a deliberate dark band */ }
@custom-variant dark (&:where(.ink, .ink *));
```

Two decisions do the work:

**The alias layer is `@theme inline`.** With `@theme inline` Tailwind substitutes the value into the utility — `.bg-surface-white { background-color: var(--orq-surface-white) }` rather than `var(--color-surface-white)`. That distinction is load-bearing. A non-inline alias computes once at `:root` and the resolved value inherits down, so a descendant scope could never re-point it: the ink band failed to invert anything at all. Inline keeps resolution per element.

**A band is declared by the class `ink`.** It paints the structural black and re-points every token inside it, so the footer, the auth shell, the Company Hub canvas and the onboarding flow all invert without a single `dark:` variant.

`dark:` therefore means "inside a band". It is off by default and switches on inside `.ink`. It previously keyed off a `.dark` class that nothing applied, so every `dark:` style in the codebase was dead.

**Getting this wrong is quiet.** A literal `bg-white` inside a band stays white while its `text-ink` label turns white too, and so does a `bg-surface-white` outside a band that the author expected to invert. Grep for `bg-white` whenever you add a band, and prefer `bg-surface-white` for anything that should follow the scope.

### The migration bridge is closed

The first pass of this work registered the historical names — the Tailwind default palette, the landing's editorial set, and the `orq8-*` brand utilities — as aliases onto semantic tokens, so the surfaces could move one at a time without ever rendering an off-palette hue. Every call site has since been moved: 668 + 44 in the first retirement pass and 1,937 in the second, plus 32 hand corrections where the old name meant something more specific than a colour swap.

Bridge deleted. Nothing in `apps/web/app/globals.css` resolves a legacy name any more, and a stray `bg-gray-100` now fails visibly instead of quietly picking a colour someone else chose for it. If you need a colour, name its meaning: `bg-surface-white`, `text-ink-muted`, `bg-mark-active`, `border-hairline`.

Three defect classes were only visible because the second pass read the old names' intent rather than their values:

- **Dead classes.** `border-orq8-green-200`, `hover:bg-orq8-green-300` and `bg-success-50` were never registered, so they emitted no CSS at all — the "Good" health grade and two "how it works" cards rendered with no background.
- **Unreadable labels.** `text-orq8-orange` (`#F1C095`, 1.59:1) was the eyebrow on five light landing sections, `text-orq8-orange-bright` the same, and `text-red-400/500` the forms error copy. All now resolve to the derived `-ink` tones.
- **Invisible marks.** A 2px `#C2F2F2` dot on a white bar is 1.17:1. Marks now use the `--orq-mark-*` pair, which is context-aware rather than decorative.

### Running the audit

```bash
pnpm audit:contrast     # reads the values out of globals.css, exits non-zero on regression
```

It resolves `var()` and `color-mix()`, measures every required pair in both scopes, and checks the sequential ramp for step separation. `/design/colors` renders the same system live, and the old in-app `test:contrast` script was deleted with the bridge it depended on.

---

## 8. What was removed

| Removed | Where |
|---|---|
| `#B8FF66` neon lime | `.orq8-lime`, the sidebar logo dot, `HealthScore`, the pricing glows, `globals.css` |
| `#605DFF` indigo | the logo glyph default |
| `#1a5c2e`, `#144a24`, `#2d7a42`, `#4a9d62` green ramp | `--color-navy-*` |
| `#b84a1e`, `#a03f19`, `#E86A33`, `#c14f1f` oranges | the warm family |
| `#f59e0b` stock amber, `#ef4444` stock red, `#10b981` / `#37d80a` money green | the numeric scales, now deleted |
| `#f5f5f5`, `#f3f4f6`, `#fafafa`, `#64748b` grays | surfaces, borders and text |
| ~165 `blue` / `indigo` / `purple` / `violet` / `cyan` / `sky` / `rose` / `pink` / `teal` utility call sites | app and components |
| purple navbar shadow, lavender image shadow, emerald hero glow, neon-lime card and hub-core glows | landing, hub |
| the dead `.dark` block | `globals.css` |
| `.theme-light` and its three shell call sites | superseded: light is the default |
| ~60 lines of hand-written `.orq8-*` utility CSS | replaced by real theme colours, then renamed away entirely |
| the deprecated numeric color scales | nothing referenced them |
| every `orq8-*`, `navy-*`, `void`/`abyss`/`panel`/`parchment`/`fog`/`ember`, `gray-*`/`slate-*`/`zinc-*`/`neutral-*`/`stone-*`, `emerald-*`/`green-*`, `amber-*`/`orange-*`/`yellow-*`, `red-*`/`rose-*`/`lime-*` alias | the compatibility bridge in `globals.css`, 193 lines |
| 1,937 further utility call sites in 136 files | renamed onto semantic tokens by the second retirement pass |
| `apps/web/scripts/contrast-check.mjs` and its `test:contrast` script | superseded by `scripts/color-contrast-audit.ts` (`pnpm audit:contrast`) |

---

## 9. Where colour lives in code

| File | Role |
|---|---|
| `apps/web/app/globals.css` | The only place colour values exist: `:root`, the ink band, the inline alias layer, the compatibility list. |
| `scripts/color-contrast-audit.ts` | Measures the palette, including the derived `color-mix` tones. Exits non-zero when a required pair regresses. |
| `apps/web/app/design/colors/page.tsx` | The living style guide at `/design/colors`, rendered from the live tokens. |
| `apps/web/app/(landing)/layout.tsx` | The marketing surface. |
| `apps/web/components/auth/auth-shell.tsx` | An ink band by design. |

There is no bridge left to inherit from. The first pass remapped the historical names onto tokens so the product could be reviewed mid-migration, and both retirement passes have since moved every call site onto a token that says what it means: 712 in the first, 1,937 in the second, plus 32 hand corrections where the old name carried a meaning the values alone did not reveal. The only colour values in the repository are the `--orq-*` declarations in `globals.css`.

---

## 10. Verification

```bash
pnpm exec tsx scripts/color-contrast-audit.ts
```

The script reads the token values **out of `globals.css`** (never from a copy), resolves both `#rrggbb` and `color-mix(in srgb, …)` so the derived tones are measured too, evaluates every pair the interface composes, and exits non-zero when a required pair drops below AA. Anything translucent is reported as *unmeasurable* rather than quietly skipped.

Current result: **every required pair clears its threshold.**

| Pair | Light scope | Ink scope |
|---|---|---|
| Body text on the page | 20.24:1 | 21.00:1 |
| Body text on a card | 21.00:1 | 18.42:1 |
| Secondary text on the page | 6.54:1 | 17.28:1 |
| Secondary text on a card | 6.79:1 | 15.16:1 |
| Tertiary text on the page | 4.58:1 | 9.57:1 |
| Brand text | 6.54:1 | 17.28:1 |
| Error text | 6.02:1 | 10.26:1 |
| Warm text | 6.83:1 | 12.71:1 |
| Focus ring (UI, ≥3:1) | 5.10:1 | 17.28:1 |
| White label on a primary button | 6.79:1 | 6.79:1 |
| White label on a secondary fill | 5.29:1 | 5.29:1 |
| Brand label on the contextual surface | 5.58:1 | 5.58:1 |
| Black label on the warm accent | 12.71:1 | 12.71:1 |
| White label on a destructive fill | 4.94:1 | 4.94:1 |
| Status: every one of the eight states | 4.94–21.00:1 | — |
| Authority: all four | 4.94–12.71:1 | — |
| Agent mode: all three | 5.58–21.00:1 | — |

The failures it caught, and how each was resolved — every resolution uses the approved palette, and each is recorded here rather than silently swapped for an unrelated colour:

| Found | Fix |
|---|---|
| Focus ring on the light page was the accent at **2.24:1** — keyboard focus was effectively invisible. | Added `--orq-focus-ring` (`#41737C`, 5.10:1). |
| Error text `#D55053` on the page is **3.97:1**. | Derived `--orq-text-error: #A83B3E` (6.02:1). |
| Warm `#F1C095` as text is **1.59:1** — it cannot be text at all. | Derived `--orq-text-warm: #7A4F1E` (6.83:1). |
| White on the spec's error fill `#D55053` is **4.12:1**. | Derived `--orq-error-fill: #C4434A` (4.94:1) for fills that carry a white label; `#D55053` remains the accent, icon and border tone. |
| Disabled label on the disabled fill was **4.15:1**. | `--orq-disabled-text: #47696F` (5.21:1). Disabled is de-emphasised by surface and opacity, not by illegible text. |
| Chart series `#C2F2F2` (**1.17:1**) and `#F1C095` (**1.59:1**) against the page. | Derived visible series tones `#5E959C` and `#C08453`; the verbatim values moved to `--orq-chart-band-3/4` for annotated area fills. |
| Inside the ink band, the light-surface error and warm text tones disappeared (**3.36:1** and **2.96:1**). | The band overrides them to `#F0A0A2` (10.26:1) and `#F1C095` (12.71:1). |

### Documented exceptions

| Item | Why it stays |
|---|---|
| Alpha-mixed values (`--orq-overlay`, the ink band's translucent borders and washes) | Not measurable against a single surface. Reported as `skip (unmeasurable)`, never as a pass. |
| grid and line textures on dark bands (`linear-gradient` at 2–3% white) | Structural texture, not a decorative colour gradient. On-palette and effectively invisible; they carry no colour meaning. |
| `waitlist-form.tsx`: `from-lime/5 to-transparent` on focus | A state affordance using an on-palette token, not colour decoration. |
| Google's four brand hexes in `components/auth/oauth-buttons.tsx` | A third-party brand mark. Recolouring it misrepresents the provider. |
| Photography | Anything used as imagery must be neutral, warm or brand-tinted. No purple or lavender backdrops. |
| `themeColor: "#EFFEFB"` in `apps/web/layout.tsx` | The browser-chrome meta value is read before any CSS exists, so `var()` cannot resolve there. The one literal hex a component file legitimately needs; it names a token in its comment. |
| `/design/colors` prints hex values | It is the style guide. The value is the content. |
| `#EFFEFB`, `#FFFFFF`, `#C2F2F2`, `#F1C095` inside comments | Explanatory prose, not declarations. A repository-wide grep for hex in `app/` and `components/` returns comments, the style guide, the meta value and Google's marks — nothing that renders. |

---

## 11. The ink band in practice

```css
.ink {
  --orq-surface-page: #000000;
  --orq-surface-white: color-mix(in srgb, #FFFFFF 8%, #000000);
  --orq-text-primary: #FFFFFF;
  --orq-text-secondary: #C2F2F2;
  /* …borders, washes, and the shadcn primitive tokens… */
}
```

Everything inside inherits the inverted values, so a card, a table, a chip or a button built from tokens is correct in a band with no extra work. `color-scheme: dark` is set so native controls follow.

One consequence worth knowing: `bg-white` is a literal `#FFFFFF`, so it stays white inside a band. Use `bg-surface-white` for anything that has to invert.

---

## 12. Ratio guidance

Not a mathematical constraint, but the intent:

```text
70%+      #FFFFFF
15–20%    #356267 / #41737C
5–10%     #C2F2F2 / #EFFEFB (small surfaces)
<5%       #F1C095
accents   #B8FF66 / #E86A33   (touches: rules, markers, dots, one ribbon)
functional only  #D55053
structural       #000000
```

The interface should feel **light first, branded second, accented third.**
