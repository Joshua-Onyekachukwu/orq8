/**
 * Department differential regression test (docs/86 §4, docs/85 §8).
 *
 * The backend resolves `settings.pageConfig` (section order + metric emphasis)
 * from the department's template at activation. Before this work the web
 * ignored it, so every department rendered the same five stats in the same
 * order. These tests pin the behaviour that makes departments read differently:
 * emphasis order, honest tone, and blueprint label normalisation.
 */
import { describe, expect, it } from "vitest";

import {
  CANONICAL_METRICS,
  CANONICAL_SECTIONS,
  DEFAULT_BLOCK_ORDER,
  ORDERABLE_BLOCKS,
  blueprintLabels,
  departmentMetrics,
  resolveBlockOrder,
  resolvePageConfig,
  type DepartmentMetricsLike,
} from "../components/work/department-focus";

const ENGINEERING_METRICS: DepartmentMetricsLike = {
  creditsUsed30d: 1200,
  tasksDone30d: 42,
  avgApprovalHours: 3,
  budgetBurnPct: 12,
  failed30d: 5,
};

describe("resolvePageConfig", () => {
  it("falls back to the canonical shape when no blueprint was written", () => {
    const cfg = resolvePageConfig({ templateSlug: "engineering" });
    expect(cfg.metrics).toEqual(CANONICAL_METRICS);
    expect(cfg.sections).toEqual(CANONICAL_SECTIONS);
  });

  it("honours the department's own emphasis when the blueprint has one", () => {
    const cfg = resolvePageConfig({
      pageConfig: { metrics: ["failed30d", "tasksDone30d"], sections: ["now", "needsFounder"] },
    });
    expect(cfg.metrics).toEqual(["failed30d", "tasksDone30d"]);
    expect(cfg.sections).toEqual(["now", "needsFounder"]);
  });

  it("ignores an empty metric list rather than rendering nothing", () => {
    expect(resolvePageConfig({ pageConfig: { metrics: [] } }).metrics).toEqual(CANONICAL_METRICS);
  });

  it("survives a null settings blob", () => {
    expect(resolvePageConfig(null).metrics).toEqual(CANONICAL_METRICS);
    expect(resolvePageConfig(undefined).sections).toEqual(CANONICAL_SECTIONS);
  });
});

describe("resolveBlockOrder", () => {
  it("renders the blocks in the department's declared order, not one hardcoded stack", () => {
    // Engineering: now → needsFounder → focus (docs/86 §6, docs/85 §8)
    expect(resolveBlockOrder(["now", "needsFounder", "focus", "employees", "workflows"])).toEqual([
      "now",
      "needsFounder",
      "focus",
      "workflows",
    ]);
    // Finance leads with what needs the founder.
    expect(resolveBlockOrder(["needsFounder", "now", "focus"])).toEqual([
      "needsFounder",
      "now",
      "focus",
      "workflows",
    ]);
    // Marketing and Customer Success lead with the work itself.
    expect(resolveBlockOrder(["now", "focus", "queued", "needsFounder"])).toEqual([
      "now",
      "focus",
      "needsFounder",
      "workflows",
    ]);
  });

  it("keeps the department's own read-model at the front when the blueprint does not place it", () => {
    // Executive Office and every pre-focus template: focus is not named, and
    // docs/86 §6 still gives it the top of the page.
    expect(resolveBlockOrder(["needsFounder", "now", "employees", "workflows"])).toEqual([
      "focus",
      "needsFounder",
      "now",
      "workflows",
    ]);
    expect(resolveBlockOrder(CANONICAL_SECTIONS)).toEqual(["focus", "now", "needsFounder", "workflows"]);
    expect(resolveBlockOrder(null)).toEqual(["focus", "now", "needsFounder", "workflows"]);
  });

  it("is an order, never a filter — a block the blueprint forgot is appended, not dropped", () => {
    for (const order of [["now"], ["metrics", "queued"], [] as string[]]) {
      const resolved = resolveBlockOrder(order);
      expect(resolved).toHaveLength(ORDERABLE_BLOCKS.length);
      expect([...resolved].sort()).toEqual([...ORDERABLE_BLOCKS].sort());
      expect([...resolved].sort()).toEqual([...DEFAULT_BLOCK_ORDER, "focus"].sort());
    }
  });

  it("ignores unknown ids and duplicates instead of rendering a hole", () => {
    expect(resolveBlockOrder(["now", "now", "charter", "nonsense", "needsFounder"])).toEqual([
      "focus",
      "now",
      "needsFounder",
      "workflows",
    ]);
  });
});

describe("departmentMetrics", () => {
  it("renders in the department's emphasis order, not a fixed one", () => {
    // Engineering leads with failures; Executive leads with throughput.
    const engineering = departmentMetrics(ENGINEERING_METRICS, [
      "failed30d",
      "tasksDone30d",
      "creditsUsed30d",
    ]);
    expect(engineering.map((m) => m.key)).toEqual([
      "failed30d",
      "tasksDone30d",
      "creditsUsed30d",
    ]);

    const executive = departmentMetrics(ENGINEERING_METRICS, [
      "tasksDone30d",
      "creditsUsed30d",
      "failed30d",
    ]);
    expect(executive.map((m) => m.key)).toEqual([
      "tasksDone30d",
      "creditsUsed30d",
      "failed30d",
    ]);
  });

  it("only marks failures bad when something actually failed", () => {
    const failing = departmentMetrics({ ...ENGINEERING_METRICS, failed30d: 4 }, ["failed30d"]);
    expect(failing[0]?.tone).toBe("bad");

    const clean = departmentMetrics({ ...ENGINEERING_METRICS, failed30d: 0 }, ["failed30d"]);
    expect(clean[0]?.tone).toBe("default");
    expect(clean[0]?.sub).toBe("nothing failed");
  });

  it("warns on a hot budget and formats a missing budget honestly", () => {
    const hot = departmentMetrics({ ...ENGINEERING_METRICS, budgetBurnPct: 91 }, ["budgetBurnPct"], 5000);
    expect(hot[0]?.tone).toBe("warn");
    expect(hot[0]?.value).toBe("91%");
    expect(hot[0]?.sub).toBe("of 5,000 credits");

    const none = departmentMetrics(
      { ...ENGINEERING_METRICS, budgetBurnPct: null, avgApprovalHours: null },
      ["budgetBurnPct", "avgApprovalHours"],
      null,
    );
    expect(none[0]?.value).toBe("—");
    expect(none[0]?.sub).toBe("no budget set");
    expect(none[1]?.value).toBe("—");
  });

  it("drops unknown metric keys instead of rendering an empty card", () => {
    const out = departmentMetrics(ENGINEERING_METRICS, ["tasksDone30d", "not_a_metric", "failed30d"]);
    expect(out.map((m) => m.key)).toEqual(["tasksDone30d", "failed30d"]);
  });

  it("returns nothing when the API did not send metrics at all", () => {
    expect(departmentMetrics(null, CANONICAL_METRICS)).toEqual([]);
    expect(departmentMetrics(undefined, CANONICAL_METRICS)).toEqual([]);
  });
});

describe("blueprintLabels", () => {
  it("accepts plain strings and object entries with any known key", () => {
    expect(blueprintLabels(["Revenue growth", { name: "Pipeline coverage" }], ["name"])).toEqual([
      "Revenue growth",
      "Pipeline coverage",
    ]);
    expect(blueprintLabels([{ title: "Ship the roadmap" }], ["goal", "title"])).toEqual([
      "Ship the roadmap",
    ]);
  });

  it("drops empty, blank and unusable entries instead of rendering holes", () => {
    expect(blueprintLabels([null, undefined, "", "  ", { other: 1 }, 7], ["name"])).toEqual([]);
    expect(blueprintLabels(undefined, ["name"])).toEqual([]);
  });

  it("keeps a whole blueprint list usable for the Charter block", () => {
    const roles = blueprintLabels(
      [{ name: "engineering_lead" }, { title: "Staff engineer" }, "qa"],
      ["name", "title"],
    );
    expect(roles).toEqual(["engineering_lead", "Staff engineer", "qa"]);
  });
});
