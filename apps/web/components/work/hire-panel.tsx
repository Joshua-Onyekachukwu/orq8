"use client";

/**
 * Hire-from-template (docs/85 P2, docs/86 §4) — the department's hiring desk.
 *
 * The API already owns hiring (`POST /v1/agent-templates/:id/hire`): it creates
 * the employee from the template's role, capabilities and suggested autonomy,
 * places it in this department, and enforces the plan's agent limit itself. This
 * panel therefore does not decide anything — it lists the hireable catalog,
 * puts the roles this department's blueprint actually asks for first, and
 * reports the API's answer verbatim (including a plan-limit 403).
 *
 * Real data only: the catalog comes from GET /api/agent-templates and the
 * groundwork order comes from the department's own `settings.roles`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { OsEmptyPanel, OsErrorPanel, OsLoadingRows, OsSection } from "../os/structure";
import { prioritiseByBlueprint } from "./template-priority";

interface AgentTemplateRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  role: string;
  capabilities: string[] | null;
  suggestedAutonomy: string;
  typicalTasks: string[] | null;
  isSystem: boolean;
}

function humanRole(role: string): string {
  return role.replace(/_/g, " ");
}

export function HirePanel({
  departmentId,
  departmentName,
  blueprintRoles,
}: {
  departmentId: string;
  departmentName: string;
  /** `settings.roles` from the department blueprint — the roles it says it needs. */
  blueprintRoles: string[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<AgentTemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hiringId, setHiringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/agent-templates", { cache: "no-store" });
      if (!res.ok) {
        setError("The hireable catalog could not be loaded.");
        setTemplates([]);
        return;
      }
      const body = (await res.json()) as { data?: AgentTemplateRow[] };
      setTemplates(body.data ?? []);
    } catch {
      setError("The hireable catalog could not be loaded.");
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Roles the department asked for come first — that is the blueprint doing its
  // job rather than the founder re-deriving what the department needs. The
  // ordering rule is pure and unit-tested (./template-priority).
  const ordered = useMemo(() => {
    const list = templates ?? [];
    const filtered = list.filter((t) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.role.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
    return prioritiseByBlueprint(filtered, blueprintRoles);
  }, [templates, blueprintRoles, query]);

  async function hire(template: AgentTemplateRow) {
    setHiringId(template.id);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/agent-templates/${template.id}/hire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          departmentId,
          ...(customName.trim() ? { name: customName.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { name?: string } ; error?: unknown }
        | null;
      if (!res.ok) {
        // Plans cap agents; the API's message is the honest one to show.
        const message =
          typeof body?.error === "string"
            ? body.error
            : (body?.error as { message?: string } | undefined)?.message ??
              "Could not hire this employee.";
        setError(message);
        return;
      }
      setNotice(`${body?.data?.name ?? template.name} joined ${departmentName}.`);
      setCustomName("");
      router.refresh();
    } catch {
      setError("Could not reach the ORQ8 API.");
    } finally {
      setHiringId(null);
    }
  }

  return (
    <OsSection
      id="hire"
      title="Hire into this department"
      description="The API creates the employee from the template's role and autonomy, and enforces your plan's agent limit."
      action={
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter roles…"
          className="w-40 rounded-md border border-hairline bg-canvas px-2 py-1 text-2xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
          aria-label="Filter hireable roles"
        />
      }
    >
      {blueprintRoles.length > 0 ? (
        <p className="-mt-1 text-2xs text-muted">
          This department's blueprint asks for: {blueprintRoles.map(humanRole).join(", ")}. Those are
          listed first.
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-xs text-ink">{notice}</p>
      ) : null}
      {error ? <OsErrorPanel title="Could not hire" detail={error} /> : null}

      {templates === null ? (
        <OsLoadingRows rows={3} />
      ) : ordered.length === 0 ? (
        <OsEmptyPanel
          title={query ? "No role matches that filter." : "No hireable roles are available."}
          hint={
            query ? "Clear the filter to see the whole catalog." : "The catalog is empty for this workspace."
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-2xs text-muted" htmlFor="hire-name">
              Name the next hire (optional)
            </label>
            <input
              id="hire-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Scout"
              className="w-40 rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ordered.map((t) => {
              const wanted = blueprintRoles.some(
                (r) => r.toLowerCase() === t.role.toLowerCase(),
              );
              const busy = hiringId === t.id;
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-canvas p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                      <p className="truncate font-mono text-2xs text-muted">
                        {humanRole(t.role)} · {t.category}
                      </p>
                    </div>
                    {wanted ? (
                      <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-3xs tracking-wide text-muted uppercase">
                        blueprint
                      </span>
                    ) : null}
                  </div>
                  {t.description ? (
                    <p className="line-clamp-2 text-2xs leading-relaxed text-muted">{t.description}</p>
                  ) : null}
                  <p className="font-mono text-3xs tracking-wide text-muted uppercase">
                    {t.suggestedAutonomy.replace(/_/g, " ")}
                    {(t.typicalTasks?.length ?? 0) > 0 ? ` · ${t.typicalTasks!.length} typical tasks` : ""}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void hire(t)}
                    className="mt-1 self-start rounded-md border border-hairline-strong px-3 py-1 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50"
                  >
                    {busy ? "Hiring…" : `Hire into ${departmentName}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </OsSection>
  );
}
