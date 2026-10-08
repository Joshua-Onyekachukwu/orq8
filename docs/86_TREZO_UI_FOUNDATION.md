# 86 — Trezo as the UI foundation (audit, mapping, decisions)

Status: P1 implemented and verified (2026-10-08). Sections 1–2 are the audit; §3 is
the component mapping; §4 is what was wired; §5 is what was deliberately rejected;
§6 records what remains.

---

## 1. What is actually in the repo

`Trezo/` is the vendored purchased template — four shipments, none of them wired
into ORQ8 (grep for `trezo` across `apps/` and `packages/` returns zero matches
before this change):

| Path | Stack | What it is |
| --- | --- | --- |
| `Trezo/admin templae/react-nextjs-tailwindcss` | Next 15, React 19, Tailwind v4 | **The admin dashboard.** Same stack generation as `apps/web`. |
| `Trezo/admin templae/react-nextjs-material-ui` | Next + MUI | Admin, MUI flavour. Irrelevant — ORQ8 is not MUI. |
| `Trezo/react-nextjs-{bootstrap,material-ui,tailwindcss}` | Next + (BS/MUI/TW) | 19 marketing landing pages each (analytics, saas, crm, finance, …). |

The Tailwind admin variant is the only relevant one: `src/app` (~40 demo route
folders: `dashboard`, `ecommerce`, `crm`, `lms`, `hotel`, `nft`, …),
`src/components` (`Layout/Header`, `Layout/SidebarMenu`, `Tables`, `Charts`,
`Widgets`, `Forms`, `Timeline`, `Users`, `Settings`, …), and a 1,815-line
`src/app/globals.css`.

**Trezo is a foundation to harvest, not a product to ship.** Its demo routes are
ecommerce/CRM/LMS content that has nothing to do with ORQ8.

## 2. What ORQ8 already has (and why this is an adaptation, not a rewrite)

ORQ8 is not a blank slate. It already carries two deliberate, documented design
layers, and a third would be a regression:

1. **Brand layer** — `apps/web/app/globals.css` `@theme` + `:root` +
   `@theme inline` alias layer (docs/65). Typography is Inter / Fraunces /
   JetBrains Mono; colour is semantic (`--orq-surface-*`, `--orq-text-*`,
   `--orq-border-*`, `--orq-warm`, `--orq-error`). The `dark:` variant is
   intentionally scoped to `.ink` — a structural black band, not a theme.
2. **Product console scope** — `.console` (docs/71), a dark-by-default
   operational scope with a founder light mode via
   `[data-console-theme]`. It re-points the whole `--orq-*` ladder plus the
   shadcn aliases, and ships `.console-card`, `.state-dot[data-state]`,
   `.btn-ghost-{white,danger}`, `.ea-avatar`, `.console-composer`, plus status
   chip token pairs, authority band pairs and chart tokens.
3. **Component layer** — `components/ui/*` (12 shadcn-style primitives:
   card, badge, button, dialog, input, select, table, …),
   `components/layout/page-container.tsx`, `page-shell.tsx`, `empty-state.tsx`,
   `loading-state.tsx`, `app-sidebar.tsx`, `top-bar.tsx`, and 40+ route folders
   under `app/app/`.

Trezo's contribution therefore is **not its palette**. Its useful contribution is
the *dashboard layout grammar* ORQ8 lacked: page header + breadcrumbs, section
panels, dense data tables, tab bars, metric widgets, timelines, drawers,
pagination, and truthful empty/loading/error state components.

### The measured gap this closes

`apps/api/src/services/departments.ts` already resolves
`settings.pageConfig = { sections[], metrics[] }` via `PAGE_CONFIGS` /
`defaultPageConfig`, written at activation by `setDepartmentBlueprint` (docs/85).
**The web never read it.** Only `templateSlug` was typed on the workspace. So
every department rendered the same five stats in the same order — the exact
"same page with a swapped name" failure docs/85 §8 exists to prevent.

## 3. Component mapping — Trezo → ORQ8

Decision key: **Reuse** (Trezo's pattern adopted as-is, re-tokened),
**Adapt** (structure kept, behaviour/terminology changed for ORQ8),
**Reject** (belongs to the demo, not the product), **Existing** (ORQ8 already
had an equal-or-better implementation — extend, do not replace).

| Trezo asset | ORQ8 use case | Decision |
| --- | --- | --- |
| `Layout/SidebarMenu` (grouped, collapsible, icon + label) | App sidebar (departments, work, decisions, memory, tools) | **Existing** — `app-sidebar.tsx` already groups and was not replaced. Borrow only its grouping rhythm when the department list grows. |
| `Layout/Header` (search, notifications, profile, fullscreen, language) | `top-bar.tsx` | **Existing/Adapt** — ORQ8's top bar is tied to real session + EA context. Fullscreen/language/RTL are demo affordances → Reject. |
| Page header + breadcrumbs pattern | `OsPageHeader` + `OsBreadcrumbs` (§4) | **Adapt** — adopted; re-tokened, `eyebrow` + `state` badge + `meta` slots added for ORQ8's operational header. |
| `Widgets/*` stat cards | `OsMetricRow` / `OsMetric`, `primitives.Stat` | **Adapt** — kept the box; dropped decorative sparklines and trend arrows that have no data behind them. |
| `Tables/*` | `OsDataTable` | **Adapt** — adopted the dense admin table (sticky header, mono uppercase headers, hairlines, whole-row affordance) at ORQ8 density (32px rows). |
| Tab bars across demo pages | `OsTabs` | **Adapt** — underline tabs; counts folded into the label. |
| `Timeline/*` | `OsTimeline` | **Adapt** — reframed as recorded execution history (newest first); no decorative icons-as-states. |
| Drawers / modals | `OsDrawer` + existing `ui/dialog.tsx` | **Adapt/Existing** — `ui/dialog` stays for modals; `OsDrawer` added for the detail-without-losing-the-list case. |
| Cards (`globals.css` `.card`) | `.console-card`, `OsPanel`, `OsSection` | **Existing** — ORQ8's card is already token-bound and theme-correct; Trezo's was not adopted. |
| Forms/validation (`Forms/*`) | Settings, employee configuration | **Reject for now** — ORQ8's `ui/{input,select,label,button}` + existing settings pages already cover it; revisit only if a real form duplicates. |
| ApexCharts / `Charts/*` | Department + company charts | **Defer** — no chart data model is exposed yet; adding a chart library before a real series exists would be decoration. Chart *tokens* (`--orq-chart-*`) already exist for when it is real. |
| FullCalendar, swiper, react-svg-worldmap, wysiwyg | — | **Reject** — demo features with no ORQ8 model. |
| Trezo palette (`--color-primary-*` indigo, `--color-gray-*`, `body: bg-gray-50`) | — | **Reject** — adopting this would erase the ORQ8 identity (docs/65) and force a rewrite of 40+ routes. Trezo's *structure* is the value; its palette is not. |
| Trezo demo routes (ecommerce, crm, lms, hotel, nft, crypto, doctor…) | — | **Reject** — no product meaning. |
| Trezo's spacing/density scale | ORQ8 console density | **Adapt** — ORQ8 density retained (it is denser, which suits an operations tool). |

## 4. Implemented in this pass

**Design system**
- `apps/web/components/os/structure.tsx` (new) — the layout layer:
  `OsStateBadge` (all nine states, token-driven), `OsBreadcrumbs`,
  `OsPageHeader`, `OsSection` (+ `emphasis`), `OsPanel`, `OsToolbar`,
  `OsMetricRow` / `OsMetric` (with `tone`), `OsTabs`, `OsDataTable` (generic,
  dense, sticky header, first-column row link), `OsTimeline`, `OsPagination`,
  `OsDrawer`, `OsEmptyPanel`, `OsLoadingRows`, `OsErrorPanel`, `OsFacts`.
- `apps/web/components/os/primitives.tsx` — `DotState` widened from 4 to the
  full nine-state vocabulary (`active · working · waiting · blocked · review ·
  done · paused · failed · offline`). `taskOsStatus` now maps `failed` to its own
  tone instead of reusing `blocked`; `employeeOsStatus` uses `paused`/`offline`.
- `apps/web/app/globals.css` — added the missing `--orq-status-failed-*` token
  pair in all three layers (`:root`, `@theme inline` alias, `.console`) plus
  `.state-dot[data-state="failed"]`. `failed` and `blocked` were previously
  indistinguishable: blocked is the loud solid fill (it wants a person *now*),
  failed is the settled wash (the run is over).

**Department differential (the docs/85 §8 requirement, now actually wired)**
- `apps/web/components/work/department-focus.ts` (new) — the pure logic: the
  `settings.pageConfig` contract (`resolvePageConfig`), the tonal metric builder
  (`departmentMetrics`) and blueprint label normalisation (`blueprintLabels`).
  It is a JSX-free module on purpose: the view imports it, and it stays
  testable in a plain node/vitest environment.
- `apps/web/components/work/department-workspace.tsx` now reads
  `settings.pageConfig` and renders the department's emphasised metrics, in the
  department's own order, with honest tone (`failed30d` only red when it is not
  zero; `budgetBurnPct` warns at ≥80%). Engineering leads with *Failed*;
  Executive leads with *Tasks done*; Finance leads with *Budget burn*.
- New **Charter** section: the template blueprint the department was activated
  with (what we measure / roles it needs / typical goals), rendered from
  `settings.kpis|roles|typicalGoals`. This is per-department content, not a
  shared block — it is why Executive and Engineering read as different
  organisations.
- The workspace's local pill tab row was replaced with `OsTabs`, so the product
  has one tab pattern instead of one per page (docs/86 §5's rule).
- `apps/web/tests/department-focus.test.ts` (new) — 12 regression tests pinning
  emphasis order, honest tone, unknown-key and null-safety behaviour, and
  blueprint label normalisation. Every claim in the two bullets above is a test,
  not a screenshot.

## 5. Rejected on purpose (recorded so it is not relitigated)

- **Trezo's palette and page templates.** Swapping ORQ8's tokens for Trezo's
  would be a regression against docs/65 and would break the `.console` scope's
  light/dark inversion, which is load-bearing for every existing route.
- **A parallel component library.** The rule for this work: if Trezo already had
  a good component *and* ORQ8 already had an equal one, extend ORQ8's. The audit
  found only five genuinely missing pieces (page header/breadcrumbs, dense
  table, tab bar, metric row, drawer) — those are what `structure.tsx` adds.
- **Decorative stats, trends and fake activity.** docs/85 §11 and the user's own
  §16 both forbid it; nothing in `structure.tsx` invents a number.

## 6. Status of the remainder

Landed after the first pass (this session):

- **Department focus read-model (engineering)** —
  `apps/api/src/services/department-focus.ts` scopes the *existing* engineering
  tables (repositories, engineering_tasks, repository_prs, sandbox_runs) to a
  department's members and is attached to `findDetail` as `focus.engineering`
  only when the department's `settings.templateSlug === 'engineering'`. Absent,
  never empty, for other templates. `PAGE_CONFIGS.engineering.sections` now
  leads with `focus`.
  Scope is recorded in the shape and shown in the UI, because it is not uniform:
  `work`/`reviews` are member-scoped, while `repositories`/`sandbox` are
  workspace-wide (ORQ8 records no owning employee for them, so the panel says so
  rather than implying the department owns them).
- **Employee workspace migrated onto the shared layer** — its eleven hand-copied
  zone headings are now `OsZoneTitle`, its tab strip is `OsTabs`, five inline
  dashed empty states are `OsEmptyPanel`, and its private `formatCost` /
  `taskDot` / `DotState` copies were deleted in favour of `os/primitives`. That
  last one was a real bug: this file still mapped `failed` → `blocked`, so the
  employee page disagreed with the department page about the same task.
- **The department roster links to the employee workspace** (`/app/agents/:id`),
  which is what makes Department → employee → work navigable.
- **`app/app/engineering/page.tsx` rebased onto the shared layer.** The last
  surface still written in a foreign visual language. It used `bg-white`,
  `text-muted-foreground` and `rounded-xl … shadow-sm` — a palette that does not
  respond to the ink theme, so those cards stayed white in dark mode — and it
  carried its own status mapper, which is why a failed run read `failed` on the
  department page and `blocked` here.
  It is now `OsSection` / `OsMetricRow` / `OsDataTable` / `OsDrawer` / `OsPanel` /
  `OsToolbar` / `OsEmptyPanel` / `OsErrorPanel` / `OsLoadingRows` / `OsFacts`,
  and the three status mappers (`workState`, `prState`, `runState`) are exported
  from `department-focus-panel.tsx` so the page and the department focus section
  cannot disagree again. It is also the first consumer of `OsDataTable` and
  `OsDrawer`, so those two stops being untested invention.
  The page keeps its own route on purpose: it is the *workspace-wide* view
  (repositories, sandbox runs, capability registry, MCP catalogs — none of which
  have an owning employee), whereas `focus.engineering` is the
  *department-scoped* view. Both reads are real and neither substitutes for the
  other.

Still open:

- **No back-link from employee → department.** `GET /v1/agents/:id` does not
  expose `departmentId`, only the department *name*, so the employee header can
  render the department as text but cannot link to it. Adding `departmentId` to
  that read is the one-line API change that closes the loop.
- **Focus models for the other departments** (marketing → campaigns/experiments;
  sales → pipeline; finance → budgets/invoices; customer success → tickets) do
  not exist yet. Engineering is the reference implementation, and the
  template-gated wiring it uses is the pattern to repeat.
- **Charts** deferred until a real series is exposed (§3).
- **Responsive verification** at 375/768/1280 across the department, employee
  and engineering pages is still owed (docs/85 §11 lists it).
- **Turning the engineering page into the department page's `focus` section is
  the shipped pattern, not a redirect.** The standalone route remains; nothing
  about it is duplicated in the department page, because the two reads have
  different scopes.
