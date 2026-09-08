"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  BarChart3,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Trash2,
  Edit3,
  Link as LinkIcon,
  X,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface Strategy {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  timeHorizon: string | null;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
}

interface Objective {
  id: string;
  strategyId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  progress: number;
  ownerAgentId: string | null;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
}

interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  description: string | null;
  status: string;
  metricType: string;
  metricStart: number | null;
  metricTarget: number | null;
  metricCurrent: number | null;
  unit: string | null;
  progress: number;
  confidence: number;
  createdAt: string;
}

interface Initiative {
  id: string;
  strategyId: string | null;
  objectiveId: string | null;
  keyResultId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  progress: number;
  estimatedHours: number | null;
  actualHours: number | null;
  createdAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function priorityColor(p: string) {
  if (p === "critical") return "bg-red-100 text-red-700";
  if (p === "high") return "bg-amber-50 text-amber-700";
  if (p === "normal") return "bg-blue-50 text-blue-700";
  return "bg-hairline text-muted";
}

function statusColor(s: string) {
  if (s === "completed") return "text-orq8-green";
  if (s === "active" || s === "on_track") return "text-orq8-green";
  if (s === "at_risk" || s === "behind" || s === "paused") return "text-amber-600";
  if (s === "failed" || s === "archived") return "text-red-500";
  return "text-muted";
}

function krProgressColor(p: number) {
  if (p >= 80) return "bg-orq8-green";
  if (p >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function calcObjectiveProgress(krs: KeyResult[]): number {
  if (krs.length === 0) return 0;
  return Math.round(krs.reduce((sum, kr) => sum + kr.progress, 0) / krs.length);
}

function calcStrategyProgress(objectives: Objective[]): number {
  if (objectives.length === 0) return 0;
  return Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length);
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T | null> {
  try {
    const res = await fetch(`/api/strategy${path}`, {
      method: opts?.method ?? "GET",
      headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Modal ───────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-hairline bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Key Result Row ──────────────────────────────────────────────────────────

function KeyResultRow({ kr, onUpdate }: { kr: KeyResult; onUpdate: (id: string, data: Partial<KeyResult>) => void }) {
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(kr.progress);

  const saveProgress = () => {
    onUpdate(kr.id, { progress });
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/5 group">
      <Circle className={`h-3 w-3 shrink-0 ${statusColor(kr.status)}`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-ink">{kr.title}</span>
        {kr.metricTarget != null && kr.unit && (
          <span className="ml-2 text-2xs text-muted">
            {kr.metricCurrent ?? 0} / {kr.metricTarget} {kr.unit}
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={e => setProgress(Number(e.target.value))}
            className="w-14 rounded border border-hairline px-1 py-0.5 text-xs text-right"
          />
          <button onClick={saveProgress} className="text-orq8-green text-2xs font-semibold">Save</button>
          <button onClick={() => setEditing(false)} className="text-muted text-2xs">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-2xs text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-12 h-1.5 rounded-full bg-muted/15 overflow-hidden">
            <div className={`h-full rounded-full ${krProgressColor(kr.progress)}`} style={{ width: `${kr.progress}%` }} />
          </div>
          <span className="font-mono">{kr.progress}%</span>
        </button>
      )}
    </div>
  );
}

// ── Objective Card ──────────────────────────────────────────────────────────

function ObjectiveCard({
  objective,
  krs,
  initiatives,
  onAddKR,
  onAddInitiative,
  onUpdateKR,
}: {
  objective: Objective;
  krs: KeyResult[];
  initiatives: Initiative[];
  onAddKR: (objectiveId: string) => void;
  onAddInitiative: (objectiveId: string) => void;
  onUpdateKR: (id: string, data: Partial<KeyResult>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const progress = calcObjectiveProgress(krs);

  return (
    <div className="rounded-xl border border-hairline bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-ink truncate">{objective.title}</h4>
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${priorityColor(objective.priority)}`}>
              {objective.priority}
            </span>
            <span className={`text-2xs font-medium ${statusColor(objective.status)}`}>
              {objective.status}
            </span>
          </div>
          {objective.description && (
            <p className="text-xs text-muted mt-0.5 line-clamp-1">{objective.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-sm font-semibold text-ink">{progress}%</span>
          <div className="w-16 h-2 rounded-full bg-muted/10 overflow-hidden">
            <div className={`h-full rounded-full ${krProgressColor(progress)}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-hairline px-4 py-3 space-y-3">
          {/* Key Results */}
          {krs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Key Results</span>
                <span className="rounded-full bg-muted/10 px-1.5 py-0.5 font-mono text-3xs text-muted">{krs.length}</span>
              </div>
              <div className="space-y-1">
                {krs.map(kr => (
                  <KeyResultRow key={kr.id} kr={kr} onUpdate={onUpdateKR} />
                ))}
              </div>
            </div>
          )}

          {/* Initiatives */}
          {initiatives.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Initiatives</span>
                <span className="rounded-full bg-muted/10 px-1.5 py-0.5 font-mono text-3xs text-muted">{initiatives.length}</span>
              </div>
              <div className="space-y-1">
                {initiatives.map(init => (
                  <div key={init.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/5">
                    <LinkIcon className="h-3 w-3 text-muted shrink-0" />
                    <span className="text-xs text-ink truncate">{init.title}</span>
                    <span className={`text-2xs font-medium ${statusColor(init.status)}`}>{init.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onAddKR(objective.id)}
              className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink hover:border-ink/20 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add Key Result
            </button>
            <button
              onClick={() => onAddInitiative(objective.id)}
              className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink hover:border-ink/20 transition-colors"
            >
              <LinkIcon className="h-3 w-3" /> Link Initiative
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Strategy Card ───────────────────────────────────────────────────────────

function StrategyCard({
  strategy,
  objectives,
  krsByObjective,
  initiativesByObjective,
  onAddObjective,
  onAddKR,
  onAddInitiative,
  onUpdateKR,
}: {
  strategy: Strategy;
  objectives: Objective[];
  krsByObjective: Map<string, KeyResult[]>;
  initiativesByObjective: Map<string, Initiative[]>;
  onAddObjective: (strategyId: string) => void;
  onAddKR: (objectiveId: string) => void;
  onAddInitiative: (objectiveId: string) => void;
  onUpdateKR: (id: string, data: Partial<KeyResult>) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const progress = calcStrategyProgress(objectives);
  const totalKRs = objectives.reduce((sum, o) => sum + (krsByObjective.get(o.id)?.length ?? 0), 0);

  return (
    <div className="rounded-xl border border-hairline bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-5 w-5 text-muted shrink-0" /> : <ChevronRight className="h-5 w-5 text-muted shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink truncate">{strategy.title}</h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${priorityColor(strategy.priority)}`}>
              {strategy.priority}
            </span>
            <span className={`text-2xs font-medium ${statusColor(strategy.status)}`}>
              {strategy.status}
            </span>
          </div>
          {strategy.description && (
            <p className="text-xs text-muted mt-0.5 line-clamp-2">{strategy.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-2xs text-muted">
            <span>{objectives.length} objectives</span>
            <span>{totalKRs} key results</span>
            {strategy.timeHorizon && <span>{strategy.timeHorizon}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-mono text-lg font-bold text-ink">{progress}%</div>
            <div className="text-2xs text-muted">progress</div>
          </div>
          <div className="w-20 h-3 rounded-full bg-muted/10 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${krProgressColor(progress)}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-hairline px-5 py-4 space-y-4">
          {objectives.length === 0 ? (
            <div className="text-center py-6">
              <Target className="mx-auto h-6 w-6 text-muted/30" />
              <p className="mt-2 text-xs text-muted">No objectives yet. Add one to start tracking measurable outcomes.</p>
            </div>
          ) : (
            objectives.map(obj => (
              <ObjectiveCard
                key={obj.id}
                objective={obj}
                krs={krsByObjective.get(obj.id) ?? []}
                initiatives={initiativesByObjective.get(obj.id) ?? []}
                onAddKR={onAddKR}
                onAddInitiative={onAddInitiative}
                onUpdateKR={onUpdateKR}
              />
            ))
          )}

          <button
            onClick={() => onAddObjective(strategy.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-orq8-green/40 px-3 py-1.5 text-xs font-medium text-orq8-green hover:bg-orq8-green/5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Objective
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [allKeyResults, setAllKeyResults] = useState<KeyResult[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showNewStrategy, setShowNewStrategy] = useState(false);
  const [showNewObjective, setShowNewObjective] = useState(false);
  const [showNewKR, setShowNewKR] = useState(false);
  const [showNewInitiative, setShowNewInitiative] = useState(false);
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [activeObjectiveId, setActiveObjectiveId] = useState<string | null>(null);

  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("high");
  const [newHorizon, setNewHorizon] = useState("quarterly");
  const [newMetricTarget, setNewMetricTarget] = useState("");
  const [newUnit, setNewUnit] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [stratRes, objRes, initRes] = await Promise.all([
      api<{ strategies: Strategy[] }>("/"),
      api<{ objectives: Objective[] }>("/objectives"),
      api<{ initiatives: Initiative[] }>("/initiatives"),
    ]);

    const strats = stratRes?.strategies ?? [];
    const objs = objRes?.objectives ?? [];
    const inits = initRes?.initiatives ?? [];

    setStrategies(strats);
    setObjectives(objs);
    setInitiatives(inits);

    // Load key results for all objectives
    const allKRs: KeyResult[] = [];
    for (const obj of objs) {
      const krRes = await api<{ keyResults: KeyResult[] }>(`/key-results?objectiveId=${obj.id}`);
      if (krRes?.keyResults) allKRs.push(...krRes.keyResults);
    }
    setAllKeyResults(allKRs);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group data
  const objectivesByStrategy = new Map<string, Objective[]>();
  for (const obj of objectives) {
    const sid = obj.strategyId ?? "__unlinked";
    if (!objectivesByStrategy.has(sid)) objectivesByStrategy.set(sid, []);
    objectivesByStrategy.get(sid)!.push(obj);
  }

  const krsByObjective = new Map<string, KeyResult[]>();
  for (const kr of allKeyResults) {
    if (!krsByObjective.has(kr.objectiveId)) krsByObjective.set(kr.objectiveId, []);
    krsByObjective.get(kr.objectiveId)!.push(kr);
  }

  const initiativesByObjective = new Map<string, Initiative[]>();
  for (const init of initiatives) {
    const key = init.objectiveId ?? "__unlinked";
    if (!initiativesByObjective.has(key)) initiativesByObjective.set(key, []);
    initiativesByObjective.get(key)!.push(init);
  }

  // ── Create handlers ─────────────────────────────────────────────────────

  const createStrategy = async () => {
    if (!newTitle.trim()) return;
    await api("/", { method: "POST", body: { title: newTitle, description: newDesc || null, priority: newPriority, timeHorizon: newHorizon } });
    setNewTitle(""); setNewDesc(""); setShowNewStrategy(false);
    loadData();
  };

  const createObjective = async () => {
    if (!newTitle.trim() || !activeStrategyId) return;
    await api("/objectives", { method: "POST", body: { title: newTitle, description: newDesc || null, strategyId: activeStrategyId, priority: newPriority } });
    setNewTitle(""); setNewDesc(""); setShowNewObjective(false);
    loadData();
  };

  const createKR = async () => {
    if (!newTitle.trim() || !activeObjectiveId) return;
    const body: Record<string, unknown> = { title: newTitle, description: newDesc || null, objectiveId: activeObjectiveId };
    if (newMetricTarget) body.metricTarget = Number(newMetricTarget);
    if (newUnit) body.unit = newUnit;
    await api("/key-results", { method: "POST", body });
    setNewTitle(""); setNewDesc(""); setNewMetricTarget(""); setNewUnit(""); setShowNewKR(false);
    loadData();
  };

  const createInitiative = async () => {
    if (!newTitle.trim() || !activeObjectiveId) return;
    await api("/initiatives", { method: "POST", body: { title: newTitle, description: newDesc || null, objectiveId: activeObjectiveId } });
    setNewTitle(""); setNewDesc(""); setShowNewInitiative(false);
    loadData();
  };

  const updateKR = async (id: string, data: Partial<KeyResult>) => {
    await api(`/key-results?id=${id}`, { method: "PATCH", body: data });
    loadData();
  };

  // ── Open modals ─────────────────────────────────────────────────────────

  const openAddObjective = (strategyId: string) => {
    setActiveStrategyId(strategyId);
    setNewTitle(""); setNewDesc("");
    setShowNewObjective(true);
  };

  const openAddKR = (objectiveId: string) => {
    setActiveObjectiveId(objectiveId);
    setNewTitle(""); setNewDesc(""); setNewMetricTarget(""); setNewUnit("");
    setShowNewKR(true);
  };

  const openAddInitiative = (objectiveId: string) => {
    setActiveObjectiveId(objectiveId);
    setNewTitle(""); setNewDesc("");
    setShowNewInitiative(true);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <PageErrorBoundary pageName="Strategy" backHref="/app">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">Strategy</h1>
            <p className="mt-1 text-sm text-muted">
              Define your company&apos;s strategic direction. Connect strategy to measurable objectives and key results.
            </p>
          </div>
          <button
            onClick={() => { setNewTitle(""); setNewDesc(""); setShowNewStrategy(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orq8-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Strategy
          </button>
        </div>

        {/* Stats bar */}
        {strategies.length > 0 && (
          <div className="mt-4 flex items-center gap-4 rounded-xl border border-hairline bg-white px-4 py-3 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-orq8-green" />
              <span className="font-medium text-ink">{strategies.filter(s => s.status === "active").length}</span> active strategies
            </div>
            <div className="w-px h-4 bg-hairline" />
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-orq8-orange" />
              <span className="font-medium text-ink">{objectives.length}</span> objectives
            </div>
            <div className="w-px h-4 bg-hairline" />
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-orq8-green" />
              <span className="font-medium text-ink">{allKeyResults.length}</span> key results
            </div>
            <div className="w-px h-4 bg-hairline" />
            <div className="flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-medium text-ink">{initiatives.length}</span> initiatives
            </div>
          </div>
        )}

        {/* Content */}
        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted">Loading strategy…</div>
          ) : strategies.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-10 text-center">
              <Target className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No strategies yet</p>
              <p className="mt-1 text-xs text-muted">
                Create your first strategy to set the direction for your company.
              </p>
              <button
                onClick={() => { setNewTitle(""); setNewDesc(""); setShowNewStrategy(true); }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orq8-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Create Strategy
              </button>
            </div>
          ) : (
            strategies.map(strategy => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                objectives={objectivesByStrategy.get(strategy.id) ?? []}
                krsByObjective={krsByObjective}
                initiativesByObjective={initiativesByObjective}
                onAddObjective={openAddObjective}
                onAddKR={openAddKR}
                onAddInitiative={openAddInitiative}
                onUpdateKR={updateKR}
              />
            ))
          )}
        </div>

        {/* ── Modals ────────────────────────────────────────────────────── */}

        {/* New Strategy */}
        <Modal open={showNewStrategy} onClose={() => setShowNewStrategy(false)} title="New Strategy">
          <div className="space-y-3">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Strategy title (e.g., Reach $1M ARR in 18 months)"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
              onKeyDown={e => e.key === "Enter" && createStrategy()}
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <div className="flex gap-3">
              <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-xs text-ink">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
              <select value={newHorizon} onChange={e => setNewHorizon(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-xs text-ink">
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="18month">18 Months</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewStrategy(false)} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
              <button onClick={createStrategy} className="rounded-lg bg-orq8-green px-4 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90">Create</button>
            </div>
          </div>
        </Modal>

        {/* New Objective */}
        <Modal open={showNewObjective} onClose={() => setShowNewObjective(false)} title="New Objective">
          <div className="space-y-3">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Objective title (e.g., Launch enterprise tier)"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
              onKeyDown={e => e.key === "Enter" && createObjective()}
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-xs text-ink">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewObjective(false)} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
              <button onClick={createObjective} className="rounded-lg bg-orq8-green px-4 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90">Create</button>
            </div>
          </div>
        </Modal>

        {/* New Key Result */}
        <Modal open={showNewKR} onClose={() => setShowNewKR(false)} title="New Key Result">
          <div className="space-y-3">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Key result (e.g., Close 5 enterprise deals)"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
              onKeyDown={e => e.key === "Enter" && createKR()}
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <div className="flex gap-3">
              <input
                type="number"
                value={newMetricTarget}
                onChange={e => setNewMetricTarget(e.target.value)}
                placeholder="Target"
                className="w-24 rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
              />
              <input
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                placeholder="Unit (e.g., $, deals, %)"
                className="w-32 rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewKR(false)} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
              <button onClick={createKR} className="rounded-lg bg-orq8-green px-4 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90">Create</button>
            </div>
          </div>
        </Modal>

        {/* New Initiative */}
        <Modal open={showNewInitiative} onClose={() => setShowNewInitiative(false)} title="Link Initiative">
          <div className="space-y-3">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Initiative title (e.g., Enterprise sales playbook)"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
              onKeyDown={e => e.key === "Enter" && createInitiative()}
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewInitiative(false)} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
              <button onClick={createInitiative} className="rounded-lg bg-orq8-green px-4 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90">Create</button>
            </div>
          </div>
        </Modal>
      </div>
    </PageErrorBoundary>
  );
}
