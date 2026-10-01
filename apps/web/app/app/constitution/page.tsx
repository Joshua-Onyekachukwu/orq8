"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { AlertTriangle, Check, Loader2, Plus, Save, X } from "lucide-react";

/**
 * Company Constitution (docs/71 §M, marketing/headquarters-mock-v2.html
 * `screen-constitution`). The mock's composition: a header with the one
 * primary CTA, a banner stating that the constitution binds Atlas too, then
 * numbered article cards — each §N with an Active chip and the rule itself.
 * Everything here stays editable; every save bumps the version and writes
 * an audit event.
 */

interface Constitution {
  companyPurpose: string;
  values: string[];
  agentPolicies: {
    canDecide: string[];
    needsApproval: string[];
    neverAllowed: string[];
  };
  budgetPolicy: {
    dailyLimit: number;
    monthlyLimit: number;
    requiresApprovalAbove: number;
  };
  communicationPolicy: string;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  version: number;
  updatedAt: string | null;
}

const defaultConstitution: Constitution = {
  companyPurpose: "",
  values: [],
  agentPolicies: { canDecide: [], needsApproval: [], neverAllowed: [] },
  budgetPolicy: { dailyLimit: 5000, monthlyLimit: 100000, requiresApprovalAbove: 10000 },
  communicationPolicy: "",
  riskTolerance: "moderate",
  version: 1,
  updatedAt: null,
};

/** The mock's article header: §N, the title, and the Active chip. */
function ArticleHead({ n, title, count }: { n: number; title: string; count?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
        §{n}
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-0.5 font-mono text-2xs uppercase tracking-wide text-mark-active">
        Active
      </span>
      {typeof count === "number" && (
        <span className="font-mono text-2xs text-muted">
          {count} {count === 1 ? "rule" : "rules"}
        </span>
      )}
    </div>
  );
}

export default function ConstitutionPage() {
  const [constitution, setConstitution] = useState<Constitution>(defaultConstitution);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Temporary input state for list items
  const [newCanDecide, setNewCanDecide] = useState("");
  const [newNeedsApproval, setNewNeedsApproval] = useState("");
  const [newNeverAllowed, setNewNeverAllowed] = useState("");
  const [newValue, setNewValue] = useState("");

  const fetchConstitution = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/constitution");
      if (res.ok) {
        const json = await res.json();
        setConstitution(json.data ?? defaultConstitution);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConstitution(); }, [fetchConstitution]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/constitution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(constitution),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to save constitution");
      }
      const json = await res.json();
      setConstitution(json.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const addListItem = (
    field: "canDecide" | "needsApproval" | "neverAllowed",
    value: string,
    setter: (v: string) => void
  ) => {
    if (!value.trim()) return;
    setConstitution((prev) => ({
      ...prev,
      agentPolicies: {
        ...prev.agentPolicies,
        [field]: [...prev.agentPolicies[field], value.trim()],
      },
    }));
    setter("");
  };

  const removeListItem = (
    field: "canDecide" | "needsApproval" | "neverAllowed",
    index: number
  ) => {
    setConstitution((prev) => ({
      ...prev,
      agentPolicies: {
        ...prev.agentPolicies,
        [field]: prev.agentPolicies[field].filter((_, i) => i !== index),
      },
    }));
  };

  const addValue = () => {
    if (!newValue.trim()) return;
    setConstitution((prev) => ({ ...prev, values: [...prev.values, newValue.trim()] }));
    setNewValue("");
  };

  const removeValue = (index: number) => {
    setConstitution((prev) => ({ ...prev, values: prev.values.filter((_, i) => i !== index) }));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="console-card animate-pulse p-6">
            <div className="h-4 w-1/3 rounded bg-hairline" />
            <div className="mt-3 h-20 rounded bg-hairline" />
          </div>
        ))}
      </div>
    );
  }

  const amended = constitution.updatedAt
    ? new Date(constitution.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  const PolicyList = ({
    n,
    title,
    field,
    items,
    value,
    setter,
    placeholder,
  }: {
    n: number;
    title: string;
    field: "canDecide" | "needsApproval" | "neverAllowed";
    items: string[];
    value: string;
    setter: (v: string) => void;
    placeholder: string;
  }) => (
    <section className="console-card p-5">
      <ArticleHead n={n} title={title} count={items.length} />
      <div className="mt-3 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2">
            <span className="flex-1 text-sm text-ink">{item}</span>
            <button
              type="button"
              aria-label={`Remove rule: ${item}`}
              onClick={() => removeListItem(field, i)}
              className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-error-soft hover:text-error-ink"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addListItem(field, value, setter); } }}
            placeholder={placeholder}
            className="console-composer flex-1 text-sm"
          />
          <button
            type="button"
            aria-label={`Add rule to ${title}`}
            onClick={() => addListItem(field, value, setter)}
            className="inline-flex shrink-0 items-center rounded-md border border-hairline-strong px-3 py-2 text-ink transition-colors hover:bg-elevated"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <PageErrorBoundary pageName="Company Constitution" backHref="/app">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Governance · v{constitution.version}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Constitution</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              The rules every employee and the EA must follow. Only you can change them — every
              change writes an audit event.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
          >
            {saving ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> :
              saved ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> :
              <Save aria-hidden="true" className="h-3.5 w-3.5" />}
            {saved ? "Saved" : "Amend constitution"}
          </button>
        </header>

        {error && (
          <div className="console-card flex items-start gap-3 border-border-error bg-error-soft/40 p-4 text-sm text-error-ink">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm text-error-ink">{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-error-ink hover:opacity-80">Dismiss</button>
          </div>
        )}

        {/* The mock's banner: the constitution binds Atlas too. */}
        <div className="console-card flex flex-wrap items-baseline justify-between gap-2 p-4">
          <p className="text-sm text-ink">
            The constitution binds Atlas too. Atlas cannot hire, spend or publish outside these
            articles — anything not allowed here opens a gate for you.
          </p>
          <p className="font-mono text-2xs text-muted">
            {amended ? `Last amended ${amended}` : "Not yet amended"} · every change writes an audit event
          </p>
        </div>

        {/* §1 — Company purpose */}
        <section className="console-card p-5">
          <ArticleHead n={1} title="Company purpose" />
          <textarea
            value={constitution.companyPurpose}
            onChange={(e) => setConstitution((prev) => ({ ...prev, companyPurpose: e.target.value }))}
            rows={3}
            placeholder="What does your company exist to do?"
            className="console-composer mt-3 w-full resize-none text-sm"
          />
        </section>

        {/* §2 — Core values */}
        <section className="console-card p-5">
          <ArticleHead n={2} title="Core values" count={constitution.values.length} />
          {constitution.values.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {constitution.values.map((v, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs text-ink">
                  {v}
                  <button
                    type="button"
                    aria-label={`Remove value: ${v}`}
                    onClick={() => removeValue(i)}
                    className="rounded-full p-0.5 text-muted transition-colors hover:text-error-ink"
                  >
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(); } }}
              placeholder="Add a core value…"
              className="console-composer flex-1 text-sm"
            />
            <button
              type="button"
              aria-label="Add company value"
              onClick={addValue}
              className="inline-flex shrink-0 items-center rounded-md border border-hairline-strong px-3 py-2 text-ink transition-colors hover:bg-elevated"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* §3–§5 — Agent policies */}
        <PolicyList
          n={3}
          title="Agents can decide alone"
          field="canDecide"
          items={constitution.agentPolicies.canDecide}
          value={newCanDecide}
          setter={setNewCanDecide}
          placeholder="e.g. Drafting internal documents"
        />
        <PolicyList
          n={4}
          title="Requires your approval"
          field="needsApproval"
          items={constitution.agentPolicies.needsApproval}
          value={newNeedsApproval}
          setter={setNewNeedsApproval}
          placeholder="e.g. Sending external emails — silence is never consent"
        />
        <PolicyList
          n={5}
          title="Never allowed"
          field="neverAllowed"
          items={constitution.agentPolicies.neverAllowed}
          value={newNeverAllowed}
          setter={setNewNeverAllowed}
          placeholder="e.g. Making financial commitments"
        />

        {/* §6 — Risk tolerance */}
        <section className="console-card p-5">
          <ArticleHead n={6} title="Risk tolerance" />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(["conservative", "moderate", "aggressive"] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setConstitution((prev) => ({ ...prev, riskTolerance: level }))}
                aria-pressed={constitution.riskTolerance === level}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  constitution.riskTolerance === level
                    ? "border-hairline-strong bg-elevated text-ink"
                    : "border-hairline text-ink-muted hover:bg-elevated"
                }`}
              >
                <span className="block text-xs font-semibold capitalize text-ink">{level}</span>
                <span className="mt-0.5 block text-2xs text-muted">
                  {level === "conservative" ? "AI asks before most actions" :
                   level === "moderate" ? "AI handles routine, you approve risky" :
                   "AI operates broadly, you review periodically"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* §7 — Budget policy */}
        <section className="console-card p-5">
          <ArticleHead n={7} title="Budget policy" />
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="budget-daily" className="mb-1 block font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Daily limit (credits)
              </label>
              <input
                id="budget-daily"
                type="number"
                value={constitution.budgetPolicy.dailyLimit}
                onChange={(e) => setConstitution((prev) => ({
                  ...prev, budgetPolicy: { ...prev.budgetPolicy, dailyLimit: Number(e.target.value) },
                }))}
                className="console-composer w-full text-sm"
              />
            </div>
            <div>
              <label htmlFor="budget-monthly" className="mb-1 block font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Monthly limit (credits)
              </label>
              <input
                id="budget-monthly"
                type="number"
                value={constitution.budgetPolicy.monthlyLimit}
                onChange={(e) => setConstitution((prev) => ({
                  ...prev, budgetPolicy: { ...prev.budgetPolicy, monthlyLimit: Number(e.target.value) },
                }))}
                className="console-composer w-full text-sm"
              />
            </div>
            <div>
              <label htmlFor="budget-approval" className="mb-1 block font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Approval required above (credits)
              </label>
              <input
                id="budget-approval"
                type="number"
                value={constitution.budgetPolicy.requiresApprovalAbove}
                onChange={(e) => setConstitution((prev) => ({
                  ...prev, budgetPolicy: { ...prev.budgetPolicy, requiresApprovalAbove: Number(e.target.value) },
                }))}
                className="console-composer w-full text-sm"
              />
            </div>
          </div>
        </section>

        {/* §8 — Communication policy */}
        <section className="console-card p-5">
          <ArticleHead n={8} title="Communication policy" />
          <textarea
            value={constitution.communicationPolicy}
            onChange={(e) => setConstitution((prev) => ({ ...prev, communicationPolicy: e.target.value }))}
            rows={3}
            placeholder="Rules for how agents communicate on behalf of your company…"
            className="console-composer mt-3 w-full resize-none text-sm"
          />
        </section>
      </div>
    </PageErrorBoundary>
  );
}
