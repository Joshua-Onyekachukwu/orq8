"use client";

/**
 * Department template catalog (docs/85 P2) — establishing departments.
 *
 * Activation is the API's one-click path: it creates the real department, its
 * teams, and stamps the blueprint (kpis / roles / typicalGoals / pageConfig —
 * docs/85 §3.2) so the new department knows what it is for. This catalog opens
 * a template's blueprint BEFORE activating it, because the blueprint is the
 * whole reason to pick one template over another.
 *
 * Cap: the API enforces the plan's department limit. A 403 is shown with the
 * API's own message rather than a guess made here.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { OsEmptyPanel, OsErrorPanel, OsFacts, OsSection, OsToolbar } from "../os/structure";
import { blueprintLabels as labels } from "./department-focus";

export interface DepartmentTemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mission: string | null;
  functions: string[] | null;
  roles: string[] | null;
  teams: Array<{ name?: string; description?: string }> | null;
  typicalGoals: unknown[] | null;
  kpis: unknown[] | null;
  industry: string | null;
  isSystem: boolean;
}

export function TemplateCatalog({
  templates,
  activeDepartmentNames,
}: {
  templates: DepartmentTemplateRow[];
  /** Names of departments that already exist, so the catalog can say so. */
  activeDepartmentNames: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ templateName: string; departmentId?: string } | null>(null);

  const activeSet = useMemo(
    () => new Set(activeDepartmentNames.map((n) => n.toLowerCase())),
    [activeDepartmentNames],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return templates;
    const q = query.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.industry ?? "").toLowerCase().includes(q),
    );
  }, [templates, query]);

  async function activate(t: DepartmentTemplateRow) {
    setActivating(t.id);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch(`/api/department-templates/${t.id}/activate`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { data?: { departmentId?: string }; error?: unknown }
        | null;
      if (!res.ok) {
        const message =
          typeof body?.error === "string"
            ? body.error
            : (body?.error as { message?: string } | undefined)?.message ??
              "Could not activate this department.";
        setError(message);
        return;
      }
      setCreated({ templateName: t.name, departmentId: body?.data?.departmentId });
      setOpenId(null);
      router.refresh();
    } catch {
      setError("Could not reach the ORQ8 API.");
    } finally {
      setActivating(null);
    }
  }

  return (
    <OsSection
      id="catalog"
      title="Available department templates"
      count={filtered.length}
      description="Each template establishes a real department with its roles, KPIs and page emphasis — not a shell."
    >
      <OsToolbar>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search departments or industries…"
          aria-label="Search department templates"
          className="w-full max-w-xs rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
        />
        <span className="text-2xs text-muted">
          {activeDepartmentNames.length} department{activeDepartmentNames.length === 1 ? "" : "s"} already
          established
        </span>
      </OsToolbar>

      {created ? (
        <p className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-xs text-ink">
          {created.templateName} is established.
          {created.departmentId ? (
            <>
              {" "}
              <Link
                href={`/app/departments/${created.departmentId}`}
                className="underline underline-offset-4 hover:text-brand-ink"
              >
                Open it
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <OsErrorPanel title="Could not activate" detail={error} /> : null}

      {filtered.length === 0 ? (
        <OsEmptyPanel
          title={query ? "No template matches that search." : "No department templates are available."}
          hint={query ? "Try a different term." : undefined}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((t) => {
            const already = activeSet.has(t.name.toLowerCase());
            const open = openId === t.id;
            const roles = labels(t.roles ?? undefined, ["name", "title", "role"]);
            const kpis = labels(t.kpis ?? undefined, ["name", "label", "title"]);
            const goals = labels(t.typicalGoals ?? undefined, ["goal", "name", "title"]);
            const busy = activating === t.id;
            return (
              <li key={t.id} className="flex flex-col rounded-lg border border-hairline bg-canvas p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                    <p className="truncate font-mono text-2xs text-muted">
                      {t.slug}
                      {t.industry ? ` · ${t.industry}` : ""}
                      {t.isSystem ? "" : " · custom"}
                    </p>
                  </div>
                  {already ? (
                    <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-3xs tracking-wide text-muted uppercase">
                      established
                    </span>
                  ) : null}
                </div>

                {t.mission ?? t.description ? (
                  <p className="mt-2 line-clamp-3 text-2xs leading-relaxed text-muted">
                    {t.mission ?? t.description}
                  </p>
                ) : null}

                <p className="mt-2 font-mono text-3xs tracking-wide text-muted uppercase">
                  {roles.length} roles · {kpis.length} KPIs ·{" "}
                  {(t.teams?.length ?? 0)} teams · {goals.length} goals
                </p>

                <div className="mt-auto flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    disabled={busy || already}
                    onClick={() => void activate(t)}
                    className="rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50"
                  >
                    {busy ? "Establishing…" : already ? "Already established" : "Establish department"}
                  </button>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : t.id)}
                    className="rounded-md border border-hairline px-3 py-1.5 text-2xs text-muted transition-colors hover:text-ink"
                  >
                    {open ? "Hide blueprint" : "View blueprint"}
                  </button>
                </div>

                {open ? (
                  <div className="mt-3 rounded-md border border-hairline p-3">
                    <OsFacts
                      columns={1}
                      items={[
                        {
                          label: "Roles it will create",
                          value: roles.length ? roles.map((r) => r.replace(/_/g, " ")).join(", ") : "—",
                        },
                        {
                          label: "What it measures",
                          value: kpis.length ? kpis.join(", ") : "—",
                        },
                        {
                          label: "Typical goals",
                          value: goals.length ? goals.join(", ") : "—",
                        },
                      ]}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </OsSection>
  );
}
