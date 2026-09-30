import type { Metadata } from "next";
import { ThemeToggle } from "../../components/theme-toggle";

export const metadata: Metadata = { title: "Console skin preview" };

/**
 * Mirrors packages/core/src/design-tokens.ts (CONSOLE_DARK / CONSOLE_LIGHT)
 * for display only — kept literal here so the client harness does not import
 * @orq8/core (web intentionally does not depend on it; see lib/console-theme).
 * If the palettes drift, this page should be updated with them.
 */
const DARK_SWATCHES: Record<string, string> = {
  bg: "#0B0F14",
  surface: "#11161D",
  hover: "#161D26",
  line: "#1E2732",
  lineStrong: "#2A3646",
  lime: "#A6CE95",
  orange: "#E9974F",
  red: "#E07A7A",
  info: "#8FB8D8",
  muted: "#97A3B4",
  body: "#E6EAF0",
  onOrange: "#231206",
};

const LIGHT_SWATCHES: Record<string, string> = {
  bg: "#FFFFFF",
  surface: "#F7F8FA",
  hover: "#EEF1F4",
  line: "#E3E8EE",
  lineStrong: "#C9D2DC",
  lime: "#5C9E31",
  orange: "#E8761A",
  red: "#C23B3B",
  info: "#2563EB",
  ink: "#0E1520",
  body: "#2A3340",
  muted: "#5C6878",
  onOrange: "#FFFFFF",
};

/**
 * Design harness (docs/71 Phase 0–1 verification): mounts the real `.console`
 * scope and the real ThemeToggle so the skin and the light/dark flip can be
 * verified in the running app without a session or the API. Read-only, no
 * data; remove when the live console makes it redundant.
 *
 * Note: `@orq8/core` is transpiled for the client (next.config
 * transpilePackages) and design-tokens.ts is dependency-free constants, so
 * importing it here is safe.
 */
function Swatches({ title, tokens }: { title: string; tokens: Record<string, string> }) {
  return (
    <div className="console-card p-4">
      <h2 className="text-2sm font-semibold text-ink">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(tokens).map(([name, value]) => (
          <div key={name} className="rounded-lg border border-hairline p-2">
            <div
              className="h-8 w-full rounded-md border border-hairline"
              style={{ background: value }}
            />
            <div className="mt-1 text-3xs text-ink-muted">{name}</div>
            <div className="font-mono text-3xs text-ink-faint">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ConsoleSkinPage() {
  return (
    <div className="console min-h-screen p-6 sm:p-10" data-console-theme="dark">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-overline text-ink-faint">docs/71 · Phase 0–1 verification</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">Console skin preview</h1>
            <p className="mt-1 text-sm text-ink-muted">
              The real <code className="font-mono">.console</code> scope and the real toggle —
              flip it and the whole scope re-points its tokens.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="console-card p-4">
          <h2 className="text-2sm font-semibold text-ink">Semantic tokens in this scope</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {[
              ["bg-canvas", "page"],
              ["bg-surface-secondary", "raised"],
              ["text-ink", "primary text"],
              ["text-ink-muted", "secondary text"],
              ["border-hairline", "hairline"],
              ["text-warm-ink", "CTA accent"],
            ].map(([cls, role]) => (
              <div
                key={cls}
                className={`rounded-lg border border-hairline ${cls} flex items-center justify-center p-3`}
              >
                <span className="text-xs">{role}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="console-card p-4">
          <h2 className="text-2sm font-semibold text-ink">State dots & decision pair</h2>
          <div className="mt-3 flex items-center gap-4 text-sm text-ink-muted">
            <span className="state-dot" data-state="working" />
            <span className="state-dot" data-state="waiting" />
            <span className="state-dot" data-state="blocked" />
            <span className="state-dot" />
            <span className="ml-auto flex gap-2">
              <button className="btn-ghost-white rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors">
                Approve
              </button>
              <button className="btn-ghost-danger rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors">
                Reject
              </button>
            </span>
          </div>
        </div>

        <div className="console-composer p-4 text-sm text-ink-faint">
          Message Atlas — composer shell preview
        </div>

        <Swatches title="Dark palette (mirrors packages/core CONSOLE_DARK)" tokens={DARK_SWATCHES} />
        <Swatches title="Light palette (mirrors packages/core CONSOLE_LIGHT)" tokens={LIGHT_SWATCHES} />
      </div>
    </div>
  );
}
