"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  ScrollText,
  Shield,
  AlertTriangle,
  Save,
  Loader2,
  Plus,
  X,
  Check,
  Briefcase,
} from "lucide-react";

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
          <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-6">
            <div className="h-4 w-1/3 rounded bg-hairline" />
            <div className="mt-3 h-20 rounded bg-hairline" />
          </div>
        ))}
      </div>
    );
  }

  const ListSection = ({
    title,
    icon,
    color,
    field,
    items,
    value,
    setter,
    placeholder,
  }: {
    title: string;
    icon: React.ReactNode;
    color: string;
    field: "canDecide" | "needsApproval" | "neverAllowed";
    items: string[];
    value: string;
    setter: (v: string) => void;
    placeholder: string;
  }) => (
    <div className="rounded-xl border border-hairline bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="font-mono text-3xs text-muted">{items.length} rules</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2">
            <span className="flex-1 text-sm text-ink">{item}</span>
            <button
              type="button"
              onClick={() => removeListItem(field, i)}
              className="shrink-0 rounded p-1 text-muted hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addListItem(field, value, setter); } }}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
          />
          <button
            type="button"
            onClick={() => addListItem(field, value, setter)}
            className="shrink-0 rounded-lg bg-orq8-green px-3 py-2 text-white transition-colors hover:bg-orq8-green-dark"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <PageErrorBoundary pageName="Company Constitution" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
            Governance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Company Constitution
          </h1>
          <p className="mt-1 text-sm text-muted">
            The rules your AI organization runs by — what agents can do, what needs your approval,
            and how resources are managed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xs text-muted">v{constitution.version}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
              saved ? <Check className="h-3.5 w-3.5" /> :
              <Save className="h-3.5 w-3.5" />}
            {saved ? "Saved" : "Save Constitution"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Company Purpose */}
      <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orq8-lime/10 text-orq8-green">
            <Briefcase className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-ink">Company Purpose</h3>
        </div>
        <textarea
          value={constitution.companyPurpose}
          onChange={(e) => setConstitution((prev) => ({ ...prev, companyPurpose: e.target.value }))}
          rows={3}
          placeholder="What does your company exist to do?"
          className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green resize-none"
        />
      </section>

      {/* Company Values */}
      <section className="mt-4 rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
            <ScrollText className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-ink">Core Values</h3>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {constitution.values.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-orq8-dark px-3 py-1 text-xs font-medium text-white">
              {v}
              <button type="button" onClick={() => removeValue(i)} className="ml-1 rounded-full hover:bg-white/20 p-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addValue(); } }}
            placeholder="Add a core value..."
            className="flex-1 rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
          />
          <button type="button" onClick={addValue} className="shrink-0 rounded-lg bg-orq8-green px-3 py-2 text-white transition-colors hover:bg-orq8-green-dark">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Risk Tolerance */}
      <section className="mt-4 rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Shield className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-ink">Risk Tolerance</h3>
        </div>
        <div className="flex gap-3">
          {(["conservative", "moderate", "aggressive"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setConstitution((prev) => ({ ...prev, riskTolerance: level }))}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                constitution.riskTolerance === level
                  ? "border-orq8-dark bg-orq8-dark text-white"
                  : "border-hairline bg-white text-ink hover:bg-canvas"
              }`}
            >
              <span className="block text-xs font-semibold capitalize">{level}</span>
              <span className="block mt-0.5 text-3xs opacity-70">
                {level === "conservative" ? "AI asks before most actions" :
                 level === "moderate" ? "AI handles routine, you approve risky" :
                 "AI operates broadly, you review periodically"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Agent Policies */}
      <div className="mt-4 grid gap-4 sm:grid-cols-1">
        <ListSection
          title="Agents Can Decide Alone"
          icon={<Check className="h-4 w-4 text-orq8-green" />}
          color="bg-orq8-lime/10"
          field="canDecide"
          items={constitution.agentPolicies.canDecide}
          value={newCanDecide}
          setter={setNewCanDecide}
          placeholder="e.g. Drafting internal documents"
        />
        <ListSection
          title="Requires Your Approval"
          icon={<Shield className="h-4 w-4 text-amber-700" />}
          color="bg-amber-50"
          field="needsApproval"
          items={constitution.agentPolicies.needsApproval}
          value={newNeedsApproval}
          setter={setNewNeedsApproval}
          placeholder="e.g. Sending external emails"
        />
        <ListSection
          title="Never Allowed"
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          color="bg-red-100"
          field="neverAllowed"
          items={constitution.agentPolicies.neverAllowed}
          value={newNeverAllowed}
          setter={setNewNeverAllowed}
          placeholder="e.g. Making financial commitments"
        />
      </div>

      {/* Budget Policy */}
      <section className="mt-4 rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Briefcase className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-ink">Budget Policy</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block font-mono text-3xs font-semibold uppercase tracking-wide text-muted">
              Daily Limit (credits)
            </label>
            <input
              type="number"
              value={constitution.budgetPolicy.dailyLimit}
              onChange={(e) => setConstitution((prev) => ({
                ...prev, budgetPolicy: { ...prev.budgetPolicy, dailyLimit: Number(e.target.value) },
              }))}
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-3xs font-semibold uppercase tracking-wide text-muted">
              Monthly Limit (credits)
            </label>
            <input
              type="number"
              value={constitution.budgetPolicy.monthlyLimit}
              onChange={(e) => setConstitution((prev) => ({
                ...prev, budgetPolicy: { ...prev.budgetPolicy, monthlyLimit: Number(e.target.value) },
              }))}
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-3xs font-semibold uppercase tracking-wide text-muted">
              Approval Required Above (credits)
            </label>
            <input
              type="number"
              value={constitution.budgetPolicy.requiresApprovalAbove}
              onChange={(e) => setConstitution((prev) => ({
                ...prev, budgetPolicy: { ...prev.budgetPolicy, requiresApprovalAbove: Number(e.target.value) },
              }))}
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green"
            />
          </div>
        </div>
      </section>

      {/* Communication Policy */}
      <section className="mt-4 rounded-xl border border-hairline bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <ScrollText className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-ink">Communication Policy</h3>
        </div>
        <textarea
          value={constitution.communicationPolicy}
          onChange={(e) => setConstitution((prev) => ({ ...prev, communicationPolicy: e.target.value }))}
          rows={3}
          placeholder="Rules for how agents communicate on behalf of your company..."
          className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-orq8-green resize-none"
        />
      </section>
    </div>
    </PageErrorBoundary>
  );
}
