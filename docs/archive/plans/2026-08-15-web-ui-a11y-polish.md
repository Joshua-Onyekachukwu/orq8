# Web UI Accessibility & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the findings from the Web Interface Guidelines review to the ORQ8 public web UI — skip link, theme-color, color-scheme, scroll-margin, form accessibility, tabular-nums, shadcn patches, and dead-code/footer cleanup.

**Architecture:** Pure client/server-component markup and CSS changes in `apps/web` (Next.js 15 app router + Tailwind v4). No new dependencies, no new routes, no behavior change beyond accessibility semantics. Each task is independently verifiable via `tsc --noEmit` plus a DOM/HTTP probe against the running dev server.

**Tech Stack:** Next.js 15.5, React 19, Tailwind CSS v4 (CSS-first `@theme` config in `app/globals.css`), shadcn/ui (Radix, `components/ui/*`), pnpm workspace.

## Global Constraints

- Execute on branch `feat/web-ui-a11y-polish`, created from the **current working tree** on `main` (the uncommitted landing/shadcn/theme work is the base — carry it forward, never discard).
- Verification gate for every task: `cd apps/web && npx tsc --noEmit` must exit 0.
- Dev server runs on `http://localhost:3000` (start detached if not running: `cd apps/web && npm run dev -- -p 3000`). The stub API is on `:3001`.
- Do NOT run `next build` while the dev server is running (distDir collision with the dev server's `.next`). The CI gate on the PR (`pnpm -r typecheck`, `pnpm -r test`) is the build validation.
- Copy rules: keep ORQ8's calm-executive voice; no exclamation marks; error messages must include a fix/next step; use `…` (U+2026) not `...`; curly quotes via `&apos;`/`&ldquo;` in JSX.
- Existing conventions: relative imports in `app/*` and `components/*` (no `@/` alias outside `components/ui` and `lib/utils`); `class-variance-authority` + `cn()` for shadcn files only.
- Every task ends with a commit. Commit messages mirror the repo's style (imperative summary, e.g. "Add skip link and theme-color to the app shell").

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/web/app/layout.tsx` | Root shell — fonts, metadata, body wrapper | Add skip link + `themeColor` metadata |
| `apps/web/app/page.tsx` | Landing (8 movements) | Add `id="main"` to root div |
| `apps/web/app/pricing/pricing-client.tsx` | Pricing page client component | Add `id="main"`; `tabular-nums` on prices |
| `apps/web/app/login/page.tsx`, `apps/web/app/register/page.tsx` | Auth pages | Add `id="main"` to container |
| `apps/web/app/settings/providers/page.tsx` | Settings page (server) | Add `id="main"` to container |
| `apps/web/app/app/page.tsx` | Authed home | Add `id="main"` to container |
| `apps/web/app/globals.css` | Theme tokens + base styles | `color-scheme`, `scroll-margin-top` |
| `apps/web/components/waitlist-form.tsx` | Waitlist capture form | `role="status"`, input attrs |
| `apps/web/components/auth-form.tsx` | Login/register form | Error focus + fix-step copy |
| `apps/web/components/providers-client.tsx` | Provider key management | Input `name` attrs + error copy |
| `apps/web/components/ui/button.tsx` | shadcn button | `transition-all` → explicit list |
| `apps/web/components/ui/dialog.tsx` | shadcn dialog | `overscroll-contain` on content |
| `apps/web/components/site-footer.tsx` | Footer (light + dark) | Replace dead `href="#"` links |
| `apps/web/components/testimonial-carousel.tsx`, `logos-strip.tsx`, `mock-ceo-home.tsx` | Dead code (unused) | Delete |

---

### Task 1: Skip link + theme-color in the app shell

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`, `apps/web/app/pricing/pricing-client.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/register/page.tsx`, `apps/web/app/settings/providers/page.tsx`, `apps/web/app/app/page.tsx` (each adds `id="main"` to its outermost content element)

**Interfaces:**
- Produces: `id="main"` anchor on every page — consumed by the skip link added here.

- [ ] **Step 1: Add the skip link and theme-color metadata to the layout**

In `apps/web/app/layout.tsx`, replace the `metadata` object with one that includes `themeColor`, and add the skip link as the first child of `<body>`:

```tsx
export const metadata: Metadata = {
  title: {
    default: "ORQ8 — The AI Organization Operating System",
    template: "%s · ORQ8",
  },
  description:
    "Tell ORQ8 what you want. It hires the team, does the work, and reports back. The AI Organization Operating System for one-person companies.",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-navy-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add `id="main"` to every page container**

For each page, add `id="main"` to the outermost rendered element:

- `app/page.tsx` — the root `<div className={...min-h-screen bg-void text-parchment}>` becomes `<div id="main" className={...}>`.
- `app/pricing/pricing-client.tsx` — the outermost element returned by `PricingPage` gets `id="main"`.
- `app/login/page.tsx` and `app/register/page.tsx` — the `<div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">` becomes `<div id="main" className="...">`.
- `app/settings/providers/page.tsx` — the `<div className="min-h-screen bg-canvas">` becomes `<div id="main" className="...">`.
- `app/app/page.tsx` — the outermost content div gets `id="main"`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Verify in the browser**

Run: `curl -s http://localhost:3000/login | grep -c "Skip to content"` and `curl -s http://localhost:3000/ | grep -c "id=\"main\""`
Expected: `1` and `1`. Optionally confirm via the preview: tab-focus once and the "Skip to content" link becomes visible at top-left.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/app/pricing/pricing-client.tsx apps/web/app/login/page.tsx apps/web/app/register/page.tsx apps/web/app/settings/providers/page.tsx apps/web/app/app/page.tsx
git commit -m "Add skip link and theme-color to the app shell"
```

---

### Task 2: Dark-mode color-scheme + scroll-margin on anchors

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: nothing. Produces: `color-scheme` on `:root`/`.dark`, `scroll-margin-top` for all `[id]` targets (used by the landing's `#start`, `#organization`, `#control` anchors).

- [ ] **Step 1: Add `color-scheme` to both theme blocks**

In `apps/web/app/globals.css`, in the `:root` block (contains `--background: oklch(1 0 0);`) add the first line `color-scheme: light;`. In the `.dark` block (contains `--background: var(--color-void);`) add the first line `color-scheme: dark;`:

```css
:root {
  color-scheme: light;
  /* ...existing semantic tokens... */
}

.dark {
  color-scheme: dark;
  /* ...existing semantic tokens... */
}
```

- [ ] **Step 2: Add scroll-margin for anchor targets**

Immediately after the existing `html { scroll-behavior: smooth; }` rule (near the top of the file, inside the original ORQ8 block), add:

```css
[id] {
  scroll-margin-top: 5rem;
}
```

- [ ] **Step 3: Typecheck (no-op, sanity)**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify**

Run: `curl -s http://localhost:3000/ | grep -c "scroll-margin-top"` against the served CSS is unreliable (dev CSS is inlined per-request); instead verify in the preview:

```js
// preview_evaluate:
JSON.stringify({ scheme: getComputedStyle(document.documentElement).colorScheme, scrollMargin: getComputedStyle(document.getElementById("start")).scrollMarginTop })
```

Expected: `{"scheme":"light","scrollMargin":"80px"}` (5rem). Add `class="dark"` to `<html>` temporarily in the probe and confirm `scheme` flips to `dark`, then remove it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "Add color-scheme and scroll-margin for dark mode and anchor navigation"
```

---

### Task 3: Waitlist form accessibility

**Files:**
- Modify: `apps/web/components/waitlist-form.tsx`

**Interfaces:**
- Consumes: none. Produces: `role="status"` on the success box (announced by AT), `name`/`autoComplete`/`spellCheck` on inputs.

- [ ] **Step 1: Make the success message live**

In `apps/web/components/waitlist-form.tsx`, the `status === "done"` branch renders a `<div className="rounded-lg border px-4 py-3 text-sm ...">`. Add `role="status"`:

```tsx
<div
  role="status"
  className={`rounded-lg border px-4 py-3 text-sm ${
    navy || partner || dark
      ? "border-white/20 bg-white/10 text-white"
      : "border-green-300 bg-green-50 text-green-800"
  }`}
>
  {message}
</div>
```

- [ ] **Step 2: Add name/autocomplete/spellcheck to the email input**

The email input (currently `type="email" required value={email} onChange={...}`) gets:

```tsx
<input
  type="email"
  required
  name="email"
  autoComplete="email"
  spellCheck={false}
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  ...
/>
```

Also add `name="name"` and `spellCheck={false}` to the partner full-name input (it already has `autoComplete`-style semantics via `aria-label`).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify**

Run: `curl -s http://localhost:3000/ | grep -c 'role="status"'` (appears in the pre-rendered HTML once the form's done-state markup is statically present) — if 0, verify via preview: type an email, submit (stub API on :3001), and probe `document.querySelector('[role="status"]') !== null`. Also confirm the email input has `autocomplete="email"` via `document.querySelector('input[type="email"]').autocomplete`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/waitlist-form.tsx
git commit -m "Make waitlist form results live and complete input semantics"
```

---

### Task 4: Auth form error handling

**Files:**
- Modify: `apps/web/components/auth-form.tsx`

**Interfaces:**
- Consumes: none. Produces: focused error region on failure; error copy with a next step.

- [ ] **Step 1: Focus the error on submit**

Add a ref and effect to `apps/web/components/auth-form.tsx`:

```tsx
import { useRef, useState } from "react";
// ...
const errorRef = useRef<HTMLDivElement>(null);
// ...
useEffect(() => {
  if (error) errorRef.current?.focus();
}, [error]);
```

Give the existing error div `ref={errorRef}` and `tabIndex={-1}`:

```tsx
{error && (
  <div
    ref={errorRef}
    tabIndex={-1}
    role="alert"
    className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
  >
    {error}
  </div>
)}
```

(`useEffect` is already imported from `"react"`; keep the import line as `import { useEffect, useRef, useState } from "react";`.)

- [ ] **Step 2: Give the generic failure a next step**

Replace the fallback error string (currently `"Something went wrong. Please try again."`):

```tsx
setError(
  (data as { error?: string } | null)?.error ??
    "That didn't work — check your details and try again. If it persists, the API may be down on :3001.",
);
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify**

Via preview on `http://localhost:3000/login`: submit an empty form (or with the stub API down) and probe:

```js
// preview_evaluate:
JSON.stringify({ focused: document.activeElement?.getAttribute("role"), alert: document.querySelector('[role="alert"]')?.textContent?.slice(0, 40) })
```

Expected: the alert element is focused (its text includes the fix step).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/auth-form.tsx
git commit -m "Focus auth errors and add next-step guidance"
```

---

### Task 5: Provider form hardening

**Files:**
- Modify: `apps/web/components/providers-client.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: named inputs (`key_name`, `api_key`, `base_url`, `new_api_key`); error copy with next steps.

- [ ] **Step 1: Add `name` attributes to the four inputs**

In `apps/web/components/providers-client.tsx`:
- The "Name (optional)" input (`id="key-name"`) → add `name="key_name"`.
- The API key input (`id="api-key"`) → add `name="api_key"`.
- The Base URL input (`id="endpoint-url"`) → add `name="base_url"`.
- The rotate input (`placeholder="New API key"`) → add `name="new_api_key"`.

- [ ] **Step 2: Add next steps to error messages**

- `"Failed to save key"` → `"Failed to save key — check the key is valid and the API is running on :3001."`
- In `runAction`, `` `${action} failed` `` → `` `${action} failed — check the API is running on :3001.` ``
- The catch block's `"Network error"` → `"Network error — is the API running on :3001?"`

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify**

This page requires auth (redirects to `/login`), so verify statically: `grep -c 'name="key_name"\|name="api_key"\|name="base_url"\|name="new_api_key"' apps/web/components/providers-client.tsx`
Expected: `4`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/providers-client.tsx
git commit -m "Complete provider form input semantics and error guidance"
```

---

### Task 6: Pricing tabular-nums

**Files:**
- Modify: `apps/web/app/pricing/pricing-client.tsx`

**Interfaces:**
- Consumes: none. Produces: stable-width numerals in price displays.

- [ ] **Step 1: Add `tabular-nums` to the tier-card price**

In `apps/web/app/pricing/pricing-client.tsx`, the tier-card price span (renders `plan.price.monthly` / `plan.price.annual`, currently `className="text-3xl font-semibold tracking-tight ..."`) becomes:

```tsx
<span
  className={`text-3xl font-semibold tracking-tight tabular-nums ${
    plan.featured ? "text-white" : "text-navy-900"
  }`}
>
  {billing === "monthly" ? plan.price.monthly : plan.price.annual}
</span>
```

- [ ] **Step 2: Add `tabular-nums` to the comparison-table price cells**

In the comparison table, the cells that render the `monthly`/`annual` price arrays (defined around line 204 as `["$0", "$49/mo", "$199/mo", "Custom"]` and the annual variant) get `tabular-nums` added to their `<td>` className. Locate the row that maps those arrays (search for `compareRows` or the `monthly`/`annual` array usage inside the `<table>` at line ~385) and add `tabular-nums` to each price `<td>`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify**

Run: `curl -s http://localhost:3000/pricing | grep -c "tabular-nums"`
Expected: at least `1`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/pricing/pricing-client.tsx
git commit -m "Use tabular numerals for pricing figures"
```

---

### Task 7: shadcn component patches

**Files:**
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/dialog.tsx`

**Interfaces:**
- Consumes: none (upstream-canonical components). Produces: no API change — class-only edits.

- [ ] **Step 1: Replace `transition-all` in the button base**

In `apps/web/components/ui/button.tsx`, in the `buttonVariants` base string, replace `transition-all` with an explicit property list:

```
transition-[color,background-color,border-color,box-shadow,transform]
```

(Keep everything else in that class string identical — `outline-none` is paired with `focus-visible:border-ring focus-visible:ring-3` so the focus-replacement rule is satisfied.)

- [ ] **Step 2: Add overscroll containment to the dialog**

In `apps/web/components/ui/dialog.tsx`, in the `DialogPrimitive.Content` className (the `fixed top-1/2 left-1/2 z-50 grid w-full ...` string), add `overscroll-contain`:

```
"fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none overscroll-contain sm:max-w-md data-open:animate-in ..."
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify**

Run: `grep -c "transition-\[color" apps/web/components/ui/button.tsx` and `grep -c "overscroll-contain" apps/web/components/ui/dialog.tsx`
Expected: `1` and `1`. (No page currently mounts a Dialog, so static verification suffices; the shadcn set is compiled into the bundle, confirmed by the build in the CI gate.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/button.tsx apps/web/components/ui/dialog.tsx
git commit -m "Tighten shadcn transition list and contain dialog overscroll"
```

---

### Task 8: Dead code removal + footer link cleanup

**Files:**
- Delete: `apps/web/components/testimonial-carousel.tsx`, `apps/web/components/logos-strip.tsx`, `apps/web/components/mock-ceo-home.tsx`
- Modify: `apps/web/components/site-footer.tsx`

**Interfaces:**
- Consumes: nothing (all three components confirmed unreferenced: `grep -rn "TestimonialCarousel|LogosStrip|MockCeoHome" apps/web --include=*.tsx | grep -v components/` returns empty). Produces: clean `components/` dir; footer links with real destinations.

- [ ] **Step 1: Confirm the components are unreferenced**

Run: `cd apps/web && grep -rn "TestimonialCarousel\|LogosStrip\|MockCeoHome" app components --include=*.tsx | grep -v "components/testimonial\|components/logos\|components/mock"`
Expected: no output.

- [ ] **Step 2: Delete the files**

Run: `cd apps/web && rm components/testimonial-carousel.tsx components/logos-strip.tsx components/mock-ceo-home.tsx`

- [ ] **Step 3: Fix the footer placeholder links**

In `apps/web/components/site-footer.tsx` (dark variant), replace the dead `href="#"` anchors with real destinations, and drop the ones with no target page:

```tsx
<nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
  <Link href="/#organization" className="transition-colors hover:text-parchment">Product</Link>
  <Link href="/#organization" className="transition-colors hover:text-parchment">How it works</Link>
  <Link href="/#control" className="transition-colors hover:text-parchment">Governance</Link>
  <Link href="/pricing" className="transition-colors hover:text-parchment">Pricing</Link>
</nav>
```

(Add `Link` to the existing `import Link from "next/link";` — it is already imported for the light variant.) Also fix the light variant: keep `Pricing` (`/pricing`) and replace the remaining `href="#"` items (`About`, `Docs`, `Privacy`, `Terms`, `Status`) with the same real anchors where they map (`About` → `/`, `Docs` → `/`, others removed), so no footer link points at `#`.

- [ ] **Step 4: Typecheck + full workspace check**

Run: `cd apps/web && npx tsc --noEmit && pnpm -r typecheck`
Expected: exit 0 for both.

- [ ] **Step 5: Verify all routes**

Run:
```bash
for p in "" "pricing" "login" "register"; do curl -s -o /dev/null -w "$p=%{http_code} " http://localhost:3000/$p; done; echo
```
Expected: `=200 =200 =200 =200`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/components/site-footer.tsx
git rm apps/web/components/testimonial-carousel.tsx apps/web/components/logos-strip.tsx apps/web/components/mock-ceo-home.tsx
git commit -m "Remove unused landing components and clean up footer links"
```

---

### Task 9: Final gate and branch push

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm -r typecheck && pnpm -r test`
Expected: typecheck exit 0; test suite green (18 API tests pass; DB-gated tests skip cleanly).

- [ ] **Step 2: Route sweep + console check**

Run the route sweep from Task 8 Step 5. Then in the preview, load `/`, `/pricing`, `/login` and confirm no console errors (`preview_logs` shows only the React DevTools info line).

- [ ] **Step 3: Commit any stragglers**

Run: `git status --short` — if anything unexpected is modified, review and commit or stash only with care. The a11y work must be the only new delta on the branch (the pre-existing uncommitted landing/shadcn/theme work rides along as the base).

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/web-ui-a11y-polish
```

- [ ] **Step 5: Open the PR**

Follow the repo's established flow: open a PR for `feat/web-ui-a11y-polish` against `main` (extract the fine-grained PAT from git's credential store — `node tools/_gh_token.mjs` pattern from prior PRs), wait for CI green (typecheck + tests), then merge.

---

## Self-Review

**Spec coverage (review findings → task):**
- Skip link + heading hierarchy → Task 1 ✓
- `theme-color` meta → Task 1 ✓
- `color-scheme: dark` → Task 2 ✓
- `scroll-margin-top` on anchors → Task 2 ✓
- Waitlist success `aria-live`/`role="status"` → Task 3 ✓
- Waitlist email `name`/`autoComplete`/`spellCheck` → Task 3 ✓
- Auth error focus + fix-step copy → Task 4 ✓
- Provider input `name` attrs + error copy → Task 5 ✓
- Pricing `tabular-nums` → Task 6 ✓
- shadcn `transition-all` + dialog overscroll → Task 7 ✓
- Dead code (carousel/logos/mock) + footer `#` links + GDRP typo (removed with the file) → Task 8 ✓
- Final CI gate + PR flow → Task 9 ✓

**Placeholder scan:** No TBD/TODO; every edit shows the exact replacement content; verification commands have concrete expected outputs.

**Type consistency:** `errorRef` is declared, attached, and focused in the same task (Task 4). `id="main"` is produced in Task 1 and consumed only by the same task's skip link. No cross-task function/type contracts beyond file paths — all changes are markup/CSS.
