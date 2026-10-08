/**
 * Department emphasis logic (docs/86 §4, docs/85 §7–§8) — pure, JSX-free.
 *
 * `apps/api` resolves `settings.pageConfig = { sections[], metrics[] }` from the
 * department's template at activation (`setDepartmentBlueprint` →
 * `defaultPageConfig`). This module is the web's read of that contract: which
 * metrics this department is judged on, in what order, and with what tone.
 *
 * It lives in a `.ts` module on purpose — the view (`department-workspace.tsx`)
 * imports it, and it stays importable from a plain node/vitest environment
 * without a JSX transform. Behaviour worth pinning in tests belongs here.
 */

/** The 30-day metric block the API returns for a department. */
export interface DepartmentMetricsLike {
  creditsUsed30d: number;
  tasksDone30d: number;
  avgApprovalHours: number | null;
  budgetBurnPct: number | null;
  failed30d: number;
}

/** Render shape — structurally compatible with `OsMetric` in `os/structure.tsx`. */
export interface DepartmentFocusMetric {
  key: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "warn" | "bad";
}

/** The department settings blob as far as this module cares. */
export interface DepartmentSettingsLike {
  templateSlug?: string;
  kpis?: unknown[];
  typicalGoals?: unknown[];
  roles?: unknown[];
  pageConfig?: { sections?: string[]; metrics?: string[] } | null;
}

/** What a department shows when its template wrote no blueprint. */
export const CANONICAL_METRICS = [
  "tasksDone30d",
  "creditsUsed30d",
  "budgetBurnPct",
  "avgApprovalHours",
];

/** What a department shows when its template wrote no section order. */
export const CANONICAL_SECTIONS = [
  "now",
  "needsFounder",
  "employees",
  "workflows",
  "metrics",
  "queued",
  "done",
  "decisions",
  "memory",
  "tools",
  "resources",
  "activity",
];

/**
 * Resolve the department's page config, falling back to the canonical shape.
 * An explicitly empty metric list is treated as "not specified" rather than
 * "show nothing" — a department page with no metrics at all is never correct.
 */
export function resolvePageConfig(settings: DepartmentSettingsLike | null | undefined): {
  sections: string[];
  metrics: string[];
} {
  const pc = settings?.pageConfig;
  return {
    sections: Array.isArray(pc?.sections) && pc.sections.length > 0 ? pc.sections : CANONICAL_SECTIONS,
    metrics: Array.isArray(pc?.metrics) && pc.metrics.length > 0 ? pc.metrics : CANONICAL_METRICS,
  };
}

/**
 * Turn the department's emphasised metric keys into renderable, toned stats.
 * Tone is honest: failures are only red when something actually failed, and a
 * budget only warns once it is genuinely hot.
 */
export function departmentMetrics(
  metrics: DepartmentMetricsLike | null | undefined,
  keys: string[],
  budget?: number | null,
): DepartmentFocusMetric[] {
  if (!metrics) return [];
  const out: Array<DepartmentFocusMetric | null> = keys.map((key) => {
    switch (key) {
      case "tasksDone30d":
        return { key, label: "Tasks done", value: metrics.tasksDone30d, sub: "last 30 days" };
      case "failed30d":
        return {
          key,
          label: "Failed",
          value: metrics.failed30d,
          sub: metrics.failed30d > 0 ? "last 30 days" : "nothing failed",
          tone: metrics.failed30d > 0 ? "bad" : "default",
        };
      case "creditsUsed30d":
        return { key, label: "Credits spent", value: metrics.creditsUsed30d, sub: "last 30 days" };
      case "avgApprovalHours":
        return {
          key,
          label: "Avg approval wait",
          value: metrics.avgApprovalHours != null ? `${metrics.avgApprovalHours}h` : "—",
          sub: "request → founder decision",
        };
      case "budgetBurnPct":
        return {
          key,
          label: "Budget burn",
          value: metrics.budgetBurnPct != null ? `${metrics.budgetBurnPct}%` : "—",
          sub: budget ? `of ${budget.toLocaleString()} credits` : "no budget set",
          tone: (metrics.budgetBurnPct ?? 0) >= 80 ? "warn" : "default",
        };
      default:
        return null;
    }
  });
  return out.filter((m): m is DepartmentFocusMetric => m !== null);
}

/**
 * Normalise a blueprint list whose entries may be plain strings or objects with
 * any of the known label keys (`name`, `title`, `label`, `goal`, …). Unusable
 * entries are dropped rather than rendered as holes.
 */
export function blueprintLabels(items: unknown[] | undefined, keys: string[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim() ? item : null;
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        for (const k of keys) {
          const v = rec[k];
          if (typeof v === "string" && v.trim()) return v;
        }
      }
      return null;
    })
    .filter((x): x is string => Boolean(x));
}
