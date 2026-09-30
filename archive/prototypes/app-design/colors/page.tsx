import type { Metadata } from "next";

/**
 * Living style guide for the ORQ8 color system (docs/65_COLOR_SYSTEM.md).
 *
 * Built from the real semantic tokens and the real component shapes, so
 * opening this page validates the palette rather than illustrating it. If a
 * token breaks, this page shows it.
 *
 * Outside the app shell: no session, no data, not indexed.
 */
export const metadata: Metadata = {
  title: "Color system",
  robots: { index: false, follow: false },
};

const T = (token: string) => `var(${token})` as const;

type Swatch = { token: string; use: string };

const BRAND: Swatch[] = [
  { token: "--orq-brand-deep", use: "Primary structural colour" },
  { token: "--orq-brand", use: "Hover, secondary actions" },
  { token: "--orq-brand-hover", use: "Pressed" },
  { token: "--orq-brand-soft", use: "Selected, contextual" },
  { token: "--orq-brand-tint", use: "Page environment" },
];

const SURFACES: Swatch[] = [
  { token: "--orq-surface-page", use: "Application background" },
  { token: "--orq-surface-white", use: "Cards, modals, forms" },
  { token: "--orq-surface-secondary", use: "Contextual surface" },
  { token: "--orq-ink", use: "Structural black band" },
  { token: "--orq-border", use: "Hairline (derived)" },
  { token: "--orq-border-strong", use: "Control border" },
];

const TEXT_TOKENS: Swatch[] = [
  { token: "--orq-text-primary", use: "Headings, strong text" },
  { token: "--orq-text-secondary", use: "Secondary text" },
  { token: "--orq-text-tertiary", use: "Metadata only" },
  { token: "--orq-text-brand", use: "Links, brand text" },
  { token: "--orq-text-warm", use: "Attention text" },
  { token: "--orq-text-error", use: "Error text" },
];

const FUNCTIONAL: Swatch[] = [
  { token: "--orq-warm", use: "Warm human accent" },
  { token: "--orq-warm-deep", use: "Warm pressed" },
  { token: "--orq-error", use: "Error accents, borders" },
  { token: "--orq-error-fill", use: "Destructive fill" },
  { token: "--orq-focus-ring", use: "Keyboard focus" },
  { token: "--orq-overlay", use: "Modal scrim" },
];

/**
 * The marks. There is no third accent: the neon lime (#B8FF66) and the burnt
 * orange (#E86A33) were retired with the marketing palette, so a small mark is
 * brand structure on a light surface and the pale tone inside an ink band.
 */
const MARKS: Swatch[] = [
  { token: "--orq-mark-brand", use: "Eyebrow tick, step rule: brand structure on a light surface" },
  { token: "--orq-ink-accent", use: "The same mark inside a band, where #356267 would disappear" },
  { token: "--orq-mark-warm", use: "A human moment, a milestone. Keep it rare." },
];

const CHART_SERIES: Swatch[] = [
  { token: "--orq-chart-1", use: "Primary series" },
  { token: "--orq-chart-2", use: "Secondary series" },
  { token: "--orq-chart-3", use: "Supporting series" },
  { token: "--orq-chart-4", use: "Highlight" },
  { token: "--orq-chart-5", use: "Negative / error" },
];

const STATUSES = [
  { state: "active", glyph: "●", label: "Active" },
  { state: "working", glyph: "◍", label: "Working" },
  { state: "waiting", glyph: "!", label: "Waiting" },
  { state: "blocked", glyph: "✕", label: "Blocked" },
  { state: "review", glyph: "◐", label: "Review" },
  { state: "done", glyph: "✓", label: "Done" },
  { state: "paused", glyph: "Ⅱ", label: "Paused" },
  { state: "offline", glyph: "—", label: "Offline" },
] as const;

const AUTHORITY = [
  { key: "can", label: "Can do" },
  { key: "spend", label: "Can spend" },
  { key: "approval", label: "Requires approval" },
  { key: "cannot", label: "Cannot do" },
] as const;

const MODES = [
  { key: "manual", label: "Manual" },
  { key: "assisted", label: "Assisted" },
  { key: "autonomous", label: "Autonomous" },
] as const;

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.token} className="flex items-center gap-3 bg-surface-white p-3">
          <span
            className="size-9 shrink-0 rounded-md border border-hairline"
            style={{ backgroundColor: T(item.token) }}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[11px] text-ink-muted">{item.token}</span>
            <span className="block truncate text-2sm text-ink">{item.use}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Chip({
  bg,
  fg,
  glyph,
  label,
}: {
  bg: string;
  fg: string;
  glyph?: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-medium"
      style={{ backgroundColor: T(bg), color: T(fg) }}
    >
      {glyph ? <span aria-hidden>{glyph}</span> : null}
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * The shapes the product actually ships.
 * ------------------------------------------------------------------ */

function ExampleButtons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-2sm font-semibold"
        style={{ backgroundColor: T("--orq-brand-deep"), color: T("--orq-on-brand") }}
      >
        Approve and run
      </button>
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-2sm font-semibold"
        style={{ backgroundColor: T("--orq-surface-secondary"), color: T("--orq-brand-deep") }}
      >
        Review the plan
      </button>
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-2sm font-medium"
        style={{ backgroundColor: "transparent", color: T("--orq-brand-deep") }}
      >
        Ghost action
      </button>
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-2sm font-semibold"
        style={{ backgroundColor: T("--orq-error-fill"), color: T("--orq-on-error") }}
      >
        Stop the campaign
      </button>
      <button
        type="button"
        disabled
        className="rounded-lg px-4 py-2 text-2sm font-semibold opacity-60"
        style={{ backgroundColor: T("--orq-disabled-surface"), color: T("--orq-disabled-text") }}
      >
        Disabled
      </button>
    </div>
  );
}

function ExampleCard() {
  return (
    <div className="rounded-xl border border-hairline bg-surface-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Workstream</p>
          <p className="mt-2 text-md font-semibold text-ink">Launch the referral loop</p>
        </div>
        <Chip bg="--orq-status-working-bg" fg="--orq-status-working-text" glyph="◍" label="Working" />
      </div>
      <p className="mt-2 text-2sm text-ink-muted">3 tasks in flight, one waiting on the founder.</p>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex size-6 items-center justify-center rounded-md"
          style={{ backgroundColor: T("--orq-brand-deep"), color: T("--orq-on-brand") }}
          aria-hidden
        >
          EA
        </span>
        <span className="text-2xs text-ink-muted">Owned by the Executive Agent</span>
      </div>
    </div>
  );
}

function ExampleEA() {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ backgroundColor: T("--orq-brand-deep"), color: T("--orq-on-brand") }}
      >
        <span className="text-2sm font-semibold">Executive Agent</span>
        <span className="ml-auto text-2xs opacity-90">Autonomous</span>
      </div>
      <div className="bg-surface-white p-4">
        <p className="text-2sm text-ink">
          I can ship the referral loop this week. Two things need you: a $420 spend approval and a
          decision on the incentive size.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip bg="--orq-authority-approval-bg" fg="--orq-authority-approval-text" label="Requires approval" />
          <Chip bg="--orq-authority-spend-bg" fg="--orq-authority-spend-text" label="Can spend" />
        </div>
      </div>
    </div>
  );
}

function ExampleAttention() {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: T("--orq-warm-soft"), borderColor: T("--orq-warm") }}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: T("--orq-text-warm") }}>
        Founder&rsquo;s attention
      </p>
      <p className="mt-2 text-md font-semibold" style={{ color: T("--orq-text-primary") }}>
        Spend request: $420 on paid search
      </p>
      <p className="mt-1 text-2sm text-ink-muted">
        The Executive Agent is paused until this is approved or rejected.
      </p>
    </div>
  );
}

function ExampleTable() {
  const rows = [
    { task: "Draft the referral brief", state: "working" as const },
    { task: "Import 2,400 contacts", state: "waiting" as const },
    { task: "Publish the pricing page", state: "blocked" as const },
    { task: "Send the launch note", state: "done" as const },
  ];
  const glyphs: Record<string, string> = { working: "◍", waiting: "!", blocked: "✕", done: "✓" };
  return (
    <div className="overflow-hidden rounded-xl border border-hairline">
      <div className="flex items-center gap-3 border-b border-hairline bg-surface-secondary px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: T("--orq-text-brand") }}>
          Task
        </span>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: T("--orq-text-brand") }}>
          State
        </span>
      </div>
      {rows.map((row, index) => (
        <div
          key={row.task}
          className={`flex items-center justify-between gap-3 bg-surface-white px-4 py-3 ${
            index > 0 ? "border-t border-hairline" : ""
          }`}
        >
          <span className="truncate text-2sm text-ink">{row.task}</span>
          <Chip
            bg={`--orq-status-${row.state}-bg`}
            fg={`--orq-status-${row.state}-text`}
            glyph={glyphs[row.state]}
            label={row.state}
          />
        </div>
      ))}
    </div>
  );
}

function ExampleAlerts() {
  return (
    <div className="grid gap-3">
      <div
        className="rounded-lg border p-3 text-2sm"
        style={{ backgroundColor: T("--orq-brand-soft"), borderColor: T("--orq-brand"), color: T("--orq-text-brand") }}
      >
        Informational — the org chart rebuilt after the hire.
      </div>
      <div
        className="rounded-lg border p-3 text-2sm"
        style={{ backgroundColor: T("--orq-warm-soft"), borderColor: T("--orq-warm"), color: T("--orq-text-warm") }}
      >
        Attention — two tasks are waiting on a founder decision.
      </div>
      <div
        className="rounded-lg border p-3 text-2sm"
        style={{ backgroundColor: T("--orq-error-soft"), borderColor: T("--orq-border-error"), color: T("--orq-text-error") }}
      >
        Error — the provider key was rejected, so no work can run.
      </div>
    </div>
  );
}

function ExampleInput() {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="example-goal" className="text-2xs font-medium text-ink">
        Goal
      </label>
      <input
        id="example-goal"
        defaultValue="Reach 100 paying companies"
        className="rounded-lg border bg-surface-white px-3 py-2 text-2sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)]"
        style={{ borderColor: T("--orq-border-strong") }}
      />
      <p className="text-2xs text-ink-faint">
        Tab in to see the focus ring — 5.1:1 on the page, 5.3:1 on white.
      </p>
    </div>
  );
}

function ExampleStates() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-dashed border-hairline bg-surface-white p-4 text-center">
        <p className="text-2sm font-medium text-ink">No goals yet</p>
        <p className="mt-1 text-2xs text-ink-muted">Set direction in plain language and work starts.</p>
      </div>
      <div className="rounded-xl border border-hairline bg-surface-white p-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Loading</p>
        <div className="mt-3 grid gap-2">
          {[80, 60, 92].map((width) => (
            <span
              key={width}
              className="block h-2 rounded-full"
              style={{ width: `${width}%`, backgroundColor: T("--orq-brand-soft") }}
            />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-hairline bg-surface-white p-4">
        <p className="text-2sm font-medium" style={{ color: T("--orq-text-error") }}>
          Provider rejected
        </p>
        <p className="mt-1 text-2xs text-ink-muted">No work ran. Fix the key and retry.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

function ExampleSet() {
  return (
    <div className="grid gap-5">
      <ExampleCard />
      <ExampleButtons />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((status) => (
          <Chip
            key={status.state}
            bg={`--orq-status-${status.state}-bg`}
            fg={`--orq-status-${status.state}-text`}
            glyph={status.glyph}
            label={status.label}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {AUTHORITY.map((item) => (
          <Chip
            key={item.key}
            bg={`--orq-authority-${item.key}-bg`}
            fg={`--orq-authority-${item.key}-text`}
            label={item.label}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((mode) => (
          <span
            key={mode.key}
            className="rounded-md border px-2.5 py-1 text-2xs font-medium"
            style={{
              backgroundColor: T(`--orq-mode-${mode.key}-bg`),
              color: T(`--orq-mode-${mode.key}-text`),
              borderColor: T(mode.key === "manual" ? "--orq-mode-manual-border" : "--orq-mode-manual-border"),
            }}
          >
            {mode.label}
          </span>
        ))}
      </div>
      <ExampleAttention />
      <ExampleEA />
      <ExampleInput />
      <ExampleTable />
      <ExampleAlerts />
      <ExampleStates />
    </div>
  );
}

function ExampleChart() {
  const bars = [42, 68, 91, 55, 74, 30, 88];
  return (
    <div className="rounded-xl border border-hairline bg-surface-white p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Credits per day</p>
      <div className="mt-3 flex h-24 items-end gap-2">
        {bars.map((value, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${value}%`,
              backgroundColor: T(value > 80 ? "--orq-chart-ramp-4" : value > 55 ? "--orq-chart-ramp-3" : "--orq-chart-ramp-2"),
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-2xs text-ink-faint">One sequential ramp, neutral to brand. Never a rainbow.</p>
    </div>
  );
}

export default function ColorSystemPage() {
  return (
    <main id="main" className="min-h-screen bg-canvas pb-16">
      <header className="border-b border-hairline bg-surface-white px-6 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">ORQ8 design system</p>
        <h1 className="mt-3 text-2xl font-semibold text-ink">Color system</h1>
        <p className="mt-2 max-w-2xl text-2sm leading-relaxed text-ink-muted">
          One token layer, one palette. The product is light-first; black is a structural band, never
          a theme. Every value below is read from the live CSS custom properties, so this page is the
          palette rather than a picture of it. The spec is{" "}
          <code className="font-mono text-[12px] text-ink-faint">docs/65_COLOR_SYSTEM.md</code>.
        </p>
      </header>

      <section className="px-6 py-8">
        <h2 className="text-lg font-semibold text-ink">Tokens</h2>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Brand</h3>
            <SwatchGrid items={BRAND} />
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Surfaces and borders
            </h3>
            <SwatchGrid items={SURFACES} />
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">Text</h3>
            <SwatchGrid items={TEXT_TOKENS} />
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Warm accent, error, interactive
            </h3>
            <SwatchGrid items={FUNCTIONAL} />
          </div>
        </div>
      </section>

      <section className="px-6 pb-8">
        <h2 className="text-lg font-semibold text-ink">Surface hierarchy, and the ink band</h2>
        <p className="mt-1 max-w-3xl text-2sm text-ink-muted">
          The page is{" "}
          <code className="font-mono text-[12px]">#FFFFFF</code> and cards are white too, separated
          by a hairline and a shadow. Controls and hovers sit on the neutral wash{" "}
          <code className="font-mono text-[12px]">--orq-surface-secondary</code>, the palest brand
          tint{" "}
          <code className="font-mono text-[12px]">#EFFEFB</code> is kept for small contextual
          surfaces, and a deliberate black band carries the footer, a major CTA, a product statement
          and the hub canvas.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-canvas p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              :root — the product
            </p>
            <div className="mt-3 grid gap-3">
              <ExampleSet />
            </div>
          </div>
          <div className="ink rounded-xl p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              .ink — the deliberate dark band
            </p>
            <div className="mt-3 grid gap-3">
              <ExampleSet />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-8">
        <h2 className="text-lg font-semibold text-ink">Marks</h2>
        <p className="mt-1 max-w-3xl text-2sm text-ink-muted">
          Nothing else is chromatic. A mark is small by design: a rule over a step, a tick beside an
          eyebrow, the dot in the footer on black, the pricing highlight. It is never a surface and
          never body text. On a light surface it is brand structure; inside a band it is the pale
          tone, because #356267 would disappear there. The warm mark is the one exception, and it
          stays rare.
        </p>
        <div className="mt-4">
          <SwatchGrid items={MARKS} />
        </div>
      </section>

      <section className="px-6 pb-8">
        <h2 className="text-lg font-semibold text-ink">Charts</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ExampleChart />
          <div>
            <SwatchGrid items={CHART_SERIES} />
            <p className="mt-3 text-2xs text-ink-faint">
              Series 3 and 4 are darkened from the palette&rsquo;s{" "}
              <code className="font-mono">#C2F2F2</code> and <code className="font-mono">#F1C095</code> so
              a drawn mark clears 3:1 on the page. The verbatim values remain on{" "}
              <code className="font-mono">--orq-chart-band-3/4</code> for labelled area fills.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6" id="rules">
        <h2 className="text-lg font-semibold text-ink">Do, and don&rsquo;t</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: T("--orq-text-brand") }}>
              Do
            </p>
            <ul className="mt-3 grid gap-2 text-2sm text-ink-muted">
              <li>Reach every colour through a token.</li>
              <li>Let the page breathe: teal is 15–20% of the screen, at most.</li>
              <li>Pair every status colour with a glyph and a word.</li>
              <li>Keep the warm accent for a human moment, and keep it rare.</li>
              <li>Distinguish departments with structure and icons, not colour.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-white p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: T("--orq-text-error") }}>
              Don&rsquo;t
            </p>
            <ul className="mt-3 grid gap-2 text-2sm text-ink-muted">
              <li>Write a hex value in a component.</li>
              <li>Paint a whole page, or every button, with the brand teal.</li>
              <li>Spend red on anything that is not an error or a destruction.</li>
              <li>Give each department or agent its own colour.</li>
              <li>Introduce blue, purple, violet, neon or a gradient accent.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-2xs text-ink-faint">
          Contrast is measured, not asserted:{" "}
          <code className="font-mono">pnpm exec tsx scripts/color-contrast-audit.ts</code>. It reads
          these same values out of globals.css — including the derived <code className="font-mono">color-mix</code>{" "}
          tones — and fails when a required pair drops below WCAG AA.
        </p>
      </section>
    </main>
  );
}
