# ORQ8 — Design Direction (borrowed patterns)

**Status:** Direction, not spec. Reviewed sources: 5 neuform design briefs (`Design MD files/`) + aura.build. This doc records what we **adopt**, what we **skip**, and why.

---

## 1. Reviewed sources

| Source | What it is | Verdict |
|---|---|---|
| `Design MD files/aethel-command-your-cellular-timeline` | Dark command-style **auth/login** section (bg `#191C21`, lime accent `#A3E635`, mono labels) | **Adopt patterns** for the `/login` + `/register` refresh |
| `Design MD files/vertex-platform-2` | **Hero** on black with lime accent, big display type | **Adopt composition** ideas for the landing hero |
| `Design MD files/connect-your-ecosystem` | **Feature/ecosystem** section (black + emerald/blue accents) | **Adopt structure** for the integrations bento |
| `Design MD files/nexus-interface` | **Dashboard showcase** (warm dark `#2C1D11`, orange `#F97316`, bento, dither, WebGL) | **Adopt density + showcase layout** for the product mockup; skip WebGL/noise |
| `Design MD files/nexus-digital-product-architecture` | **Light** login (indigo `#6366F1` on white) | Alternative auth treatment, on file |
| **aura.build** | AI builder: prompt/image → HTML + Tailwind export; templates + components; `@` composition | **Borrow workflow + reference designs**; never the hosting/export-as-is |

---

## 2. Adopted design language (the common system across all five briefs)

Every brief shares the same skeleton — that consistency is the signal worth taking:

- **Type:** Inter for display/body; **JetBrains Mono for labels + technical metadata** (12px/600). Display scale: 64px/500/1.04 hero, tight tracking on big headlines.
- **Grid:** 8px base unit · 16px component gap · 24px card padding · **80px section padding**.
- **Radius:** pills `9999px` for badges/CTAs · cards 16–32px · controls 8px.
- **Surfaces:** dark sections use a *slightly lifted* surface token (e.g. `#18181B` on `#191C21`, `#2A2D35` on `#000`) + hairline borders (`#2A2A2E`) instead of heavy shadows — this is our "calm executive" look already, just made explicit.
- **Motion:** masked reveals, staggered entrances, restrained hover lift — no bounce, no overshoot.
- **Guardrail that matters most:** *do not flatten a distinctive composition into a generic card grid; preserve the first-viewport signal.* (This is exactly the flaw the current landing avoids — keep it that way.)

**Adopt now (token-level, cheap):** switch section eyebrows + hero badge + stat readouts to **JetBrains Mono**, and normalize section spacing to the 80/24/16/8 rhythm. Everything else is a surface-level change per section.

---

## 3. Per-surface borrow map

| ORQ8 surface | Borrow from | Concrete take |
|---|---|---|
| `/login` + `/register` | aethel (dark command) | Dark auth card on the navy bg, mono field labels, lime/gold accent CTA, the "focused access flow" single-card composition |
| Landing hero | vertex-platform-2 | Product-name-as-focal treatment, one primary CTA, dark section with lifted surface panel behind the mockup |
| Integrations/ecosystem bento | connect-your-ecosystem | Black section, emerald accents per provider, connector-chip visual language |
| Product mockup + app shell density | nexus-interface | Compact stat cards, nested surfaces, mono metric readouts — the "command center" feel |
| Light variant (future / docs) | nexus-digital-product-architecture | Indigo-on-white alternative when a light mode is ever needed |

**Explicitly skipped:** WebGL/dither/particle layers (aura/nexus vibes but wrong for calm-executive), MUI (the admin pack's stack — we stay Tailwind), any third-party HTML imported wholesale.

---

## 4. aura.build — what we borrow, what we don't

**What it is:** an AI design tool (GPT/Claude/Gemini under the hood) that generates full pages or components as **HTML + Tailwind CSS + JS**, with prompt-driven layout, `@`-references to templates/components, image-to-HTML conversion, and Figma/HTML export. Free tier: 10 prompts/mo, 2 pages.

**Borrow (the workflow, not the output):**
1. **Design exploration fast** — generate 3 hero/section variants by prompt, pick the strongest, use it as the visual brief; I reimplement in our Next.js + Tailwind components.
2. **Image-to-HTML for reference** — paste a screenshot of a design Joshua likes (another product, a reference page, a sketch) → get a faithful starting layout → I port it.
3. **Component patterns** — its public navbar/bento/card components as references for our Phase 3 app shell, exactly like the reference-pack agreement.

**Don't borrow:** Aura-hosted subdomain publishing and export-as-is — static HTML fights our Next.js routes, the waitlist backend, and the session-cookie auth flow. Same trap as Webflow. We borrow *sight*, not *site*.

**Ready-to-paste prompts** (free tier is enough for these):

> *Hero section, dark navy command-center aesthetic (#0A1628 bg, subtle aurora glow, hairline borders), 64px Space Grotesk display headline "RUN AN ACTUAL COMPANY OF ONE", JetBrains Mono eyebrow "THE AI ORGANIZATION OPERATING SYSTEM", primary CTA + secondary ghost link, right side a product mockup of a CEO dashboard with status dots and a weekly-cost widget. Keep it calm and executive, no gradients over-saturation, no particles.*

> *Bento feature grid for a governance-first AI platform: 6 cards on dark background, mono labels ("Approval gates", "Encrypted keys", "Audit trail", "Company memory", "Cost-aware routing", "Weekly report"), one wide flagship card with a mini org-chart visual, emerald accent, 16px radius, hairline borders.*

---

## 5. Decision record

- **D1:** Adopt the shared token system (mono labels + 8/16/24/80 rhythm + lifted-surface dark sections) repo-wide.
- **D2:** Refresh `/login` + `/register` in the aethel dark-command style as the next UI work item.
- **D3:** Landing hero + ecosystem bento get vertex/connect treatments on the next copy pass.
- **D4:** Aura is a *reference generator* — Joshua can paste generated designs into `Design MD files/` (or any folder) and I reimplement. No Aura output is committed as-is.
- **D5:** The reference admin pack stays reference-only for the Phase 3 app shell (per prior agreement).
