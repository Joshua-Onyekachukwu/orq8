/**
 * Blueprint-first hiring order (docs/85 P2, docs/86 §4).
 *
 * A department's blueprint names the roles it needs. The hire desk must lead
 * with those, otherwise the blueprint is decorative. These tests pin the
 * ordering rule the panel depends on.
 */
import { describe, expect, it } from "vitest";

import { blueprintRank, prioritiseByBlueprint } from "../components/work/template-priority";

const T = (name: string, role: string) => ({ name, role });

describe("blueprintRank", () => {
  it("ranks an exact blueprint role first", () => {
    expect(blueprintRank("engineering_lead", ["engineering_lead", "qa_engineer"])).toBe(0);
  });

  it("ranks a same-domain role above an unrelated one", () => {
    // Blueprint says engineering_lead; the catalog offers engineering_manager.
    // Same domain, different level — the hire the department meant.
    expect(blueprintRank("engineering_manager", ["engineering_lead"])).toBe(1);
    expect(blueprintRank("sales_rep", ["engineering_lead"])).toBe(2);
  });

  it("does not call two different domains related just because they share a level", () => {
    // Both contain "lead", which says nothing about the job.
    expect(blueprintRank("sales_lead", ["engineering_lead"])).toBe(2);
    expect(blueprintRank("engineering_director", ["engineering_lead"])).toBe(1);
  });

  it("is case- and whitespace-insensitive on both sides", () => {
    expect(blueprintRank("Engineering_Lead", ["  engineering_lead "])).toBe(0);
  });

  it("treats an empty blueprint as 'no opinion' rather than matching everything", () => {
    expect(blueprintRank("anything", [])).toBe(2);
    expect(blueprintRank("anything", ["", "   "])).toBe(2);
  });
});

describe("prioritiseByBlueprint", () => {
  it("puts the department's roles first, then orders the rest alphabetically", () => {
    const catalog = [
      T("Zed", "sales_rep"),
      T("Ada", "engineering_lead"),
      T("Bo", "qa_engineer"),
      T("Cy", "marketing_writer"),
    ];
    const ordered = prioritiseByBlueprint(catalog, ["qa_engineer", "engineering_lead"]);
    expect(ordered.map((t) => t.name)).toEqual(["Ada", "Bo", "Cy", "Zed"]);
  });

  it("is stable for a department with no blueprint (pure alphabetical)", () => {
    const catalog = [T("Zed", "sales_rep"), T("Ada", "engineering_lead")];
    expect(prioritiseByBlueprint(catalog, []).map((t) => t.name)).toEqual(["Ada", "Zed"]);
  });

  it("does not mutate the caller's array", () => {
    const catalog = [T("Zed", "sales_rep"), T("Ada", "engineering_lead")];
    const snapshot = [...catalog];
    prioritiseByBlueprint(catalog, ["engineering_lead"]);
    expect(catalog).toEqual(snapshot);
  });

  it("keeps every template — ordering, never filtering", () => {
    const catalog = [T("Zed", "sales_rep"), T("Ada", "engineering_lead"), T("Bo", "qa_engineer")];
    expect(prioritiseByBlueprint(catalog, ["engineering_lead"])).toHaveLength(3);
  });
});
