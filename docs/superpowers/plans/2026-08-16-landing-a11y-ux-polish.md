# Landing (apps/landing) A11y & UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the deferred findings from the emil-design-eng, anti-ui-slop, and high-end-visual-design audits to the Trezo-based landing — explicit transitions, tokenized brand colors, contrast fixes, image alt semantics, contact-form semantics, reduced-motion and touch-target fixes, Open Graph metadata, and swiper slimming.

**Architecture:** Pure markup/CSS changes in `apps/landing` (Next.js 15 app router + Tailwind v4). No new dependencies, no new routes, no behavior change beyond semantics and motion. Each task is independently verifiable via `tsc --noEmit` plus a grep/DOM probe against the running dev server on `:3002`.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4 (CSS-first `@theme` in `src/app/globals.css`), Swiper 11 (navigation + autoplay), remixicon, pnpm workspace.

## Global Constraints

- Execute on branch `feat/landing-a11y-polish`, created from the current working tree (the redesign base rides along — never discard).
- Verification gate for every task: `cd apps/landing && npx tsc --noEmit` must exit 0.
- Dev server runs on `http://localhost:3002` (already detached). Do NOT run `next build` against the shared `.next` while it runs — use the isolated-distDir trick: back up `next.config.ts`, write `{ distDir: ".next-build-check" }`, build, restore, `rm -rf .next-build-check`, and restore any `next-env.d.ts` drift with `git checkout -- next-env.d.ts`.
- Copy rules: keep ORQ8's calm-executive voice; error copy names the problem and the fix; use `…` (U+2026) not `...`; curly quotes via `&apos;`/`&ldquo;`.
- Token rules: class-based brand colors use the existing tokens (`lime` = `#c8ff32`, `navy-950` = `#0d1427`, `navy-900` = `#0a0e19`, `navy-800` = `#14161b`, `emerald` = `#34d399`). Inline SVG `stroke`/`fill` attributes and inline `style` gradients cannot use Tailwind tokens — those hexes are accepted (P3) and must NOT be converted.
- Reduced motion: every motion addition must have a `@media (prefers-reduced-motion: reduce)` kill switch (already present for `.reveal`, `.animate-bounce-slow`, `.animate-pulse-dot`, `btn-press` — preserve those).
- Every task ends with a commit; messages mirror the repo style (imperative summary).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/app/globals.css` | Theme + motion + craft floor | Swiper button transitions, arrow touch targets, mobile-menu reduced-motion override |
| `src/app/layout.tsx` | Root shell + metadata | Open Graph / Twitter metadata; swiper CSS slim-down |
| `src/app/not-found.tsx` | 404 page | `transition-all` → explicit; `dark:bg-[#0a0e19]` → token |
| `src/components/Layout/Navbar.tsx` | Nav + mobile menu | Toggle touch target; stagger transition list; reduced-motion |
| `src/components/Home/HeroBanner.tsx` | Hero | Founder-avatar alt semantics (SVG hexes accepted) |
| `src/components/Common/About.tsx` | About section | `transition-all` + brand hexes → tokens |
| `src/components/Common/LatestBlog.tsx` | Blog teaser | `transition-all` → `transition-colors` |
| `src/components/Common/PageBanner.tsx` | Subpage banner | `transition-all` → explicit; `dark:bg-[#0a0e19]` → token |
| `src/components/Common/Services.tsx` | Services teaser | `transition-all` → explicit; `dark:bg-[#0a0e19]` → token |
| `src/components/Common/Partners.tsx` | Tool strip | Contrast: `text-gray-300`/`text-gray-400` → `text-gray-500` |
| `src/components/Common/Testimonials.tsx` | Testimonials | Decorative image alts (`alt=""` + `aria-hidden`) |
| `src/components/About/AboutContent.tsx` | About page | Lime hexes → tokens |
| `src/components/Contact/ContactForm.tsx` | Contact form | `htmlFor`/`id`/`name`/`autoComplete`; `dark:bg-[#0a0e19]` → token |
| `src/components/Contact/ContactInfo.tsx` | Contact info | `transition-all` → explicit |
| `src/components/Services/ServiceDetailsContent.tsx`, `ServicesLists.tsx`, `Sidebar.tsx` | Services pages | `transition-all` + brand hexes → explicit/tokens |
| `src/components/Layout/SidebarSettings.tsx` | Settings sidebar | `transition-all` → explicit; `dark:bg-[#0a0e19]` ×2 → token (`#202c4b` border is NOT a brand hex — leave) |

## Already Fixed (do NOT repeat)

Skip link + `id="main"` + `theme-color` (layout) · `role="status"`/`role="alert"` + input `name`/`autoComplete`/`spellCheck` on the waitlist forms · **contact form label/input semantics (`htmlFor`/`id`/`name`/`autoComplete`/`required`, phone `type="tel"` — Task 5 is DONE)** · **`scroll-margin-top: 96px` on `[id]` so the skip link clears the fixed navbar** · `prefers-reduced-motion` autoplay kill in Testimonials/Partners · swiper prev/next `aria-label`s · GoTop 44px target + single transition · `btn-press` on authored CTAs · lime/navy tokens in the authored files · remix icon unification (material-symbols removed) · `::selection` + `:focus-visible` + scrollbar theming · Reveal scroll-entry system · footer dead-link cleanup + subscribe error state.

---

### Task 1: Convert remaining `transition-all` to explicit properties

**Files:**
- Modify: `src/app/globals.css` (`.partner-slides` buttons), `src/app/not-found.tsx`, `src/components/Common/About.tsx`, `src/components/Common/LatestBlog.tsx`, `src/components/Common/PageBanner.tsx`, `src/components/Common/Services.tsx`, `src/components/Contact/ContactForm.tsx`, `src/components/Contact/ContactInfo.tsx`, `src/components/Layout/Navbar.tsx` (line ~119), `src/components/Layout/SidebarSettings.tsx`, `src/components/Services/ServiceDetailsContent.tsx`, `src/components/Services/ServicesLists.tsx`, `src/components/Services/Sidebar.tsx`

**Interfaces:** none (class-only sweep).

- [ ] **Step 1: Survey the remaining uses**

Run: `cd apps/landing && grep -rn "transition-all" src --include="*.tsx" --include="*.css"`
Expected: hits in the 13 files listed above. Classify each hit: color-only hover → `transition-colors`; opacity+transform stagger → `transition-[opacity,transform]`; anything else → the two explicit properties that actually change.

- [ ] **Step 2: Convert color-only hovers to `transition-colors`**

For every hit that only transitions `background-color`/`border-color`/`color` (the Trezo boilerplate hovers — `hover:bg-*`, `hover:text-*`, `hover:border-*`), replace `transition-all` with `transition-colors` in that class string. This is a mechanical find/replace; apply per file.

- [ ] **Step 3: Convert the mobile-menu stagger to an explicit list**

In `src/components/Layout/Navbar.tsx` line ~119, the li that toggles `opacity-0 translate-y-3` / `opacity-100 translate-y-0`:

```tsx
className={`my-[14px] md:my-[16px] first:mt-0 last:mb-0 transition-[opacity,transform] duration-300 ${
  isActiveMobileMenu ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"
}`}
```

- [ ] **Step 4: Convert the swiper buttons in globals.css**

In `src/app/globals.css`, the `.partner-slides .swiper-button-prev` and `.swiper-button-next` rules contain `transition-all hover:!text-primary-500` — replace `transition-all` with `transition-colors` in both rules.

- [ ] **Step 5: Typecheck + count**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.
Run: `grep -rn "transition-all" src --include="*.tsx" --include="*.css" | wc -l`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src
git commit -m "Convert remaining transition-all to explicit transition properties"
```

---

### Task 2: Tokenize remaining class-based brand hexes

**Files:**
- Modify: `src/app/layout.tsx` (skip-link focus colors), `src/app/not-found.tsx`, `src/components/About/AboutContent.tsx`, `src/components/Common/About.tsx` (line ~113 border, ~128 hover), `src/components/Common/PageBanner.tsx`, `src/components/Common/Services.tsx`, `src/components/Contact/ContactForm.tsx` (`dark:bg-[#0a0e19]`), `src/components/Layout/SidebarSettings.tsx` (×2), `src/components/Services/ServiceDetailsContent.tsx`, `src/components/Services/ServicesLists.tsx`, `src/components/Services/Sidebar.tsx`

**Interfaces:** none.

- [ ] **Step 1: Survey class-based hexes**

Run: `cd apps/landing && grep -rn "#c8ff32\|#0D1427\|#0a0e19\|#14161b" src --include="*.tsx"`
Expected: 12 files hit; **11 are class-based and get converted** — `layout.tsx` (skip link), `not-found.tsx`, `AboutContent.tsx`, `About.tsx` (×2), `PageBanner.tsx`, `Services.tsx`, `ContactForm.tsx` (×2), `SidebarSettings.tsx` (×2), `ServiceDetailsContent.tsx`, `ServicesLists.tsx`, `Sidebar.tsx`. **1 is skipped entirely: `HeroBanner.tsx`** (all 3 hits are SVG `stroke`/`fill` attrs + inline style — cannot use tokens). Convert only the class-based occurrences: `bg-[#c8ff32]` → `bg-lime`, `text-[#c8ff32]` → `text-lime`, `border-[#c8ff32]` → `border-lime`, `focus:bg-[#c8ff32]`/`focus:text-[#0d1427]` → `focus:bg-lime`/`focus:text-navy-950`, `dark:bg-[#0a0e19]` → `dark:bg-navy-900`. Non-brand hexes (e.g. `dark:border-[#202c4b]` in SidebarSettings, `bg-[#f0e7fd]`, `bg-amber-50`, `bg-[#f4f4f4]`) are OUT of scope — touch nothing except the four brand hexes.

- [ ] **Step 2: Convert the skip-link + surface hexes**

In `src/app/layout.tsx`, the skip link class:

```tsx
className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000] focus:bg-lime focus:text-navy-950 focus:px-4 focus:py-2 focus:rounded-md focus:font-medium"
```

In each of `not-found.tsx`, `PageBanner.tsx`, `Services.tsx`, `ServicesLists.tsx`, `Sidebar.tsx`, `SidebarSettings.tsx` (×2), `ContactForm.tsx`: replace `dark:bg-[#0a0e19]` with `dark:bg-navy-900`.

- [ ] **Step 3: Convert the About section hexes**

In `src/components/Common/About.tsx`:
- line ~113: `border border-[#c8ff32]` → `border border-lime`
- line ~128: `hover:bg-[#c8ff32]` → `hover:bg-lime`

Apply the same class-level replacements in `AboutContent.tsx` and `ServiceDetailsContent.tsx` (grep each occurrence and swap the bracket-hex class for the matching token per the Step 1 map).

- [ ] **Step 4: Verify — only accepted hexes remain**

Run: `grep -rn "#c8ff32\|#0D1427\|#0a0e19\|#14161b" src --include="*.tsx" | grep -v "stroke=\|fill=\|background:\|linear-gradient\|radial-gradient\|maskImage\|WebkitMaskImage"`
Expected: no output (the only remaining hexes are inline SVG/style, which cannot use tokens).
Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src
git commit -m "Tokenize remaining brand color classes"
```

---

### Task 3: Contrast fixes in the light sections

**Files:**
- Modify: `src/components/Common/Partners.tsx`

**Interfaces:** none.

- [ ] **Step 1: Fix the strip label contrast**

In `src/components/Common/Partners.tsx` line ~26, `text-gray-400` (≈3.2:1 on white — fails AA for small text) → `text-gray-500` (≈4.7:1 — passes):

```tsx
<p className="text-center uppercase font-bold tracking-[1.8px] text-xs text-gray-500 mb-[35px] md:mb-[45px]">
  Plugs into the tools you already run
</p>
```

- [ ] **Step 2: Fix the tool names contrast**

In `src/components/Common/Partners.tsx` line ~51, `text-gray-300` (≈1.9:1 on white — fails badly) → `text-gray-500`:

```tsx
<div className="flex items-center justify-center gap-[10px] text-gray-500 transition-colors hover:text-primary-500">
```

- [ ] **Step 3: Verify the pricing muted text is acceptable (no change)**

The pricing body uses `text-[#8f8f99]` on `bg-navy-800` — measured ≈5.3:1, passes AA for normal text. Do NOT change it; note in the commit message that it was verified.

- [ ] **Step 4: Typecheck + visual spot check**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.
Run: `curl -s http://localhost:3002 | grep -c "text-gray-500"`
Expected: ≥ 2 (the two Partners classes render server-side).

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/components/Common/Partners.tsx
git commit -m "Fix tool-strip text contrast to pass WCAG AA"
```

---

### Task 4: Image alt semantics — decorative images go `alt=""`

**Files:**
- Modify: `src/components/Home/HeroBanner.tsx`, `src/components/Common/Testimonials.tsx`

**Interfaces:** none.

- [ ] **Step 1: Hero founder avatars are decorative**

In `src/components/Home/HeroBanner.tsx`, the three founder avatars (`alt="founder"`, lines ~169-182) sit inside the "1,000+ founders in the queue" chip — the meaning is in the text, the faces are decoration. Set `alt=""` on all three `Image`s and add `aria-hidden` to the wrapping flex div.

- [ ] **Step 2: Testimonial quote + avatars are decorative**

In `src/components/Common/Testimonials.tsx`:
- The quote glyph `src="/images/icons/quote.svg"` with `alt="quote"` → `alt=""` (decorative).
- The author avatar `alt="user-image"` → `alt=""` (the adjacent `<h3>` carries the name).
- The four stacked avatars in the "FOUNDERS WHO RUN IT" chip (`alt="user-image"`) → `alt=""` and `aria-hidden` on the wrapping div.

- [ ] **Step 3: Sweep for remaining generic alts**

Run: `cd apps/landing && grep -rn 'alt="user-image"\|alt="quote"\|alt="founder"\|alt="image"' src --include="*.tsx"`
Expected: no output. Any other generic alt (`alt="blog"`, etc.) — decide per image: meaningful content → descriptive alt; decoration → `alt=""` (+`aria-hidden` on the wrapper if it has one).

- [ ] **Step 4: Typecheck**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src
git commit -m "Mark decorative landing images as alt-empty"
```

---

### Task 5: Contact form semantics

**Files:**
- Modify: `src/components/Contact/ContactForm.tsx`

**Interfaces:** none (static marketing form — no submit handler exists; do not add one, keep behavior identical).

- [ ] **Step 1: Wire labels to inputs**

The four `<label>`s currently have no `htmlFor`; the four `<input>`s (Name, Email, Phone no) and the `<textarea>` (Message) have no `id`/`name`. Add:

- Name: `htmlFor="contact-name"` + `id="contact-name"` `name="name"` `autoComplete="name"` `required`
- Email: `htmlFor="contact-email"` + `id="contact-email"` `name="email"` `type="email"` `autoComplete="email"` `required`
- Phone: `htmlFor="contact-phone"` + `id="contact-phone"` `name="phone"` `autoComplete="tel"` (not required — optional field)
- Message: `htmlFor="contact-message"` + `id="contact-message"` `name="message"` `required`

Also add `aria-required` matching `required` (native `required` already implies it — do not duplicate; only add `required` where the field is mandatory).

- [ ] **Step 2: Typecheck + verify attributes**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.
Run: `grep -c 'id="contact-' src/components/Contact/ContactForm.tsx`
Expected: `4`.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/components/Contact/ContactForm.tsx
git commit -m "Complete contact form label and input semantics"
```

---

### Task 6: Mobile menu — reduced-motion override + touch target

**Files:**
- Modify: `src/components/Layout/Navbar.tsx`, `src/app/globals.css`

**Interfaces:** none.

- [ ] **Step 1: Give the toggle a 44px touch target**

In `src/components/Layout/Navbar.tsx`, the hamburger button is 30px of bars with no padding. Add generous hit area:

```tsx
className="inline-block relative leading-none lg:hidden p-3 -m-3"
```

(`-m-3` keeps the visual position; the effective tap area becomes ~54px.)

- [ ] **Step 2: Kill the translate under reduced motion**

In `src/app/globals.css`, add to the existing `@media (prefers-reduced-motion: reduce)` block (the one that already kills `.reveal` etc.):

```css
#navbar-collapse li {
  transition: none;
  transform: none;
  opacity: 1;
}
```

This keeps the menu usable for motion-sensitive users without the slide-up stagger (opacity alone would still be fine, but instant is safest for a navigation toggle).

- [ ] **Step 3: Typecheck + verify**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.
Run: `grep -c "navbar-collapse li" src/app/globals.css`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/components/Layout/Navbar.tsx apps/landing/src/app/globals.css
git commit -m "Give the mobile toggle a real touch target and respect reduced motion"
```

---

### Task 7: Open Graph + Twitter metadata

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:** none (metadata only).

- [ ] **Step 1: Extend the metadata export**

Replace the current `metadata` object (lines ~19-27) with:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://orq8.com"),
  title: "ORQ8 — Run your company with AI employees",
  description:
    "You set the direction. ORQ8 hires the team, does the work, and reports back — under your approvals, your budgets, your audit trail.",
  applicationName: "ORQ8",
  keywords: ["AI organization", "AI employees", "solo founder", "ORQ8"],
  openGraph: {
    type: "website",
    url: "https://orq8.com",
    siteName: "ORQ8",
    title: "ORQ8 — Run your company with AI employees",
    description:
      "You set the direction. ORQ8 hires the team, does the work, and reports back — under your approvals, your budgets, your audit trail.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "ORQ8 — Run your company with AI employees",
    description:
      "The AI organization operating system. One person. One company. An entire AI workforce.",
  },
  other: {
    "theme-color": "#0d1427",
  },
};
```

(Use the real domain once it exists — this is the placeholder brand domain; do not invent image paths for og:image.)

- [ ] **Step 2: Verify served meta**

Run: `curl -s http://localhost:3002 | grep -c 'property="og:title"\|property="og:description"\|name="twitter:card"'`
Expected: `3`.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.
Commit:

```bash
git add apps/landing/src/app/layout.tsx
git commit -m "Add Open Graph and Twitter metadata to the landing shell"
```

---

### Task 8: Swiper slim-down + arrow touch targets

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/Common/Partners.tsx`

**Interfaces:** none.

- [ ] **Step 1: Stop importing the full swiper bundle**

In `src/app/layout.tsx`, remove `import "swiper/css/bundle";` and add `import "swiper/css/navigation";` (Testimonials uses `Navigation`; Partners uses `Autoplay` only, which needs no extra stylesheet):

```tsx
import "swiper/css";
import "swiper/css/navigation";
```

- [ ] **Step 2: Grow the swiper arrows to 44px**

In `src/app/globals.css`, the `.partner-slides .swiper-button-prev/next` rules use `!w-[35px] !h-[35px] lg:!w-[45px] lg:!h-[45px]` — bump the base to `!w-[44px] !h-[44px]`:

```
.partner-slides .swiper-button-prev { @apply ... !w-[44px] !h-[44px] ... }
.partner-slides .swiper-button-next { @apply ... !w-[44px] !h-[44px] ... }
```

- [ ] **Step 3: Silence the Partners loop warning**

The console logs "Swiper Loop Warning: The number of slides is not enough for loop mode" — Partners has 8 tools with a `1280: { slidesPerView: 6 }` breakpoint. In `src/components/Common/Partners.tsx`, change the `1280` breakpoint to `slidesPerView: 5` (8 slides > 5+1 keeps loop valid):

```tsx
1280: { slidesPerView: 5 },
```

- [ ] **Step 4: Verify — imports, build, console**

Run: `grep -c "swiper/css/bundle" src/app/layout.tsx`
Expected: `0`.
Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.
Then the final-gate isolated build (see Task 10) must stay green, and after a reload the preview console must not show the loop warning.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/app/layout.tsx apps/landing/src/app/globals.css apps/landing/src/components/Common/Partners.tsx
git commit -m "Slim swiper imports, grow arrows to touch target, silence loop warning"
```

---

### Task 9: Reveal + motion consistency sweep

**Files:**
- Modify: verify-only (touch only if a gap is found): `src/components/Common/Reveal.tsx`, `src/app/globals.css`

**Interfaces:** none.

- [ ] **Step 1: Confirm every motion class has a reduced-motion kill**

Run: `grep -c "prefers-reduced-motion" src/app/globals.css`
Expected: `3` (the main block, the reveal override, and one other — count the blocks, they must cover `.reveal`, `.animate-bounce-slow`, `.animate-pulse-dot`, `btn-press`).

- [ ] **Step 2: Confirm no layout-property animation**

Run: `grep -rn "transition-\[\(width\|height\|top\|left\|margin\|padding\)" src --include="*.tsx" --include="*.css"`
Expected: no output (only transform/opacity/colors transition).

- [ ] **Step 3: Scroll-trigger spot check in the preview**

In the preview (`http://localhost:3002`), scroll to the features grid and confirm `.reveal.in-view` elements resolve to `opacity: 1` (probe via `preview_evaluate`). If any `.reveal` never flips (stays opacity 0), fix by moving the `Reveal` wrapper inside the section's static container.

- [ ] **Step 4: Commit (only if a fix was needed)**

If Step 3 found a gap, commit the fix with a descriptive message. If nothing changed, skip the commit and note it in the final report.

---

### Task 10: Final gate

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + isolated production build**

Run: `cd apps/landing && npx tsc --noEmit`
Expected: exit 0.

Run (isolated distDir so the dev server's `.next` is untouched — back up `next.config.ts` first, restore after, `rm -rf .next-build-check`, and `git checkout -- apps/landing/next-env.d.ts` if it drifted):

```bash
cd apps/landing && cp next.config.ts /tmp/landing-next.bak && \
printf 'import type { NextConfig } from "next";\nconst nextConfig: NextConfig = { distDir: ".next-build-check" };\nexport default nextConfig;\n' > next.config.ts && \
npx next build && mv /tmp/landing-next.bak next.config.ts && rm -rf .next-build-check
```

Expected: build exit 0, all routes listed (`/`, `/about`, `/pricing`, `/contact`, `/services`, `/blog/details`, `/services/details`, `/api/waitlist`).

- [ ] **Step 2: Route sweep**

Run:
```bash
for p in "" "about" "pricing" "contact" "services" "blog/details" "services/details"; do curl -s -o /dev/null -w "/$p=%{http_code} " http://localhost:3002/$p; done; echo
```
Expected: all `=200`.

- [ ] **Step 3: Console check**

In the preview, reload the landing and read `preview_logs` — expect only the React DevTools info line (the Swiper loop warning must be gone after Task 8).

- [ ] **Step 4: Commit stragglers**

Run: `git status --short` — if anything unexpected is modified, review and commit or restore with care. The a11y/UX deltas must be the only new changes on the branch.

- [ ] **Step 5: Stop before push**

The branch `feat/landing-a11y-polish` is ready for review. Do NOT push or open a PR without explicit user approval.

---

## Self-Review

**Spec coverage (audit finding → task):**
- `transition-all` sweep (emil, 28 hits at audit time, 13 files remain) → Task 1 ✓
- Brand hexes → tokens (anti-ui-slop theming dimension; 11 files remain class-based, HeroBanner SVG/style exempt) → Task 2 ✓
- Partners strip contrast `text-gray-300`/`text-gray-400` (craft-floor contrast rule) → Task 3 ✓
- Generic/decorative image alts (a11y dimension) → Task 4 ✓
- Contact form unlabeled inputs (a11y dimension, missed in the first pass) → Task 5 ✓
- Mobile toggle touch target + reduced-motion stagger (high-end touch-floor + emil motion) → Task 6 ✓
- Missing OG/Twitter metadata (a11y/UX completeness) → Task 7 ✓
- Full swiper bundle + 35px arrows + loop warning (performance + touch targets) → Task 8 ✓
- Motion-consistency audit (reduced-motion coverage, transform-only) → Task 9 ✓
- Final gate (build, routes, console) → Task 10 ✓

**Placeholder scan:** No TBD/TODO; every edit shows concrete content or an exact find/replace rule; verification commands have expected outputs.

**Type consistency:** No cross-task function/type contracts — all changes are markup/CSS/metadata. `id="contact-*"` ids are defined and referenced within Task 5 only. The swiper CSS import change (Task 8) is consumed by the same task's verification.
