"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  GitBranch,
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
  BarChart3,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface LineageNode {
  id: string;
  title: string;
  type: "strategy" | "objective" | "key_result" | "initiative" | "task" | "action";
  status: string;
  progress: number;
  priority: string;
  agentName?: string;
  children: LineageNode[];
}

interface LineageScore {
  totalActiveTasks: number;
  tasksWithInitiative: number;
  tasksWithStrategy: number;
  tasksWithGoal: number;
  lineageScore: number;
  orphanedTasks: number;
  deepLinkedTasks: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function typeIcon(type: string) {
  switch (type) {
    case "strategy": return "📐";
    case "objective": return "🎯";
    case "key_result": return "📏";
    case "initiative": return "⚡";
    case "task": return "📋";
    case "action": return "▶";
    default: return "•";
  }
}

function typeColor(type: string, status: string) {
  if (status === "completed") return "text-orq8-green";
  if (status === "failed" || status === "reversed") return "text-red-500";
  if (status === "active" || status === "on_track") return "text-ink";
  return "text-muted";
}

function priorityDot(p: string) {
  if (p === "critical") return "bg-red-500";
  if (p === "high") return "bg-amber-500";
  return "bg-muted/30";
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    active: "bg-orq8-green/10 text-orq8-green",
    completed: "bg-orq8-green/10 text-orq8-green",
    on_track: "bg-orq8-green/10 text-orq8-green",
    at_risk: "bg-amber-50 text-amber-600",
    pending: "bg-hairline text-muted",
    draft: "bg-hairline text-muted",
    paused: "bg-amber-50 text-amber-600",
    behind: "bg-red-50 text-red-600",
    failed: "bg-red-50 text-red-600",
    proposed: "bg-hairline text-muted",
    archived: "bg-hairline text-muted",
  };
  return map[s] ?? "bg-hairline text-muted";
}

// ── API ─────────────────────────────────────────────────────────────────────

async function fetchTree(): Promise<LineageNode[]> {
  try {
    const res = await fetch("/api/lineage");
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree ?? [];
  } catch {
    return [];
  }
}

async function fetchScore(): Promise<LineageScore | null> {
  try {
    const res = await fetch("/api/lineage/score");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Tree Node ───────────────────────────────────────────────────────────────

function TreeNode({ node, depth = 0 }: { node: LineageNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const indent = depth * 24;

  return (
    <div style={{ marginLeft: indent }}>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/5 transition-colors ${depth === 0 ? "mb-1" : ""}`}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-muted hover:text-ink"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="shrink-0 w-3.5" />
        )}

        {/* Type icon */}
        <span className="text-sm shrink-0">{typeIcon(node.type)}</span>

        {/* Priority dot */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot(node.priority)}`} />

        {/* Title */}
        <span className={`text-xs font-medium flex-1 min-w-0 truncate ${typeColor(node.type, node.status)}`}>
          {node.title}
        </span>

        {/* Status badge */}
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs ${statusBadge(node.status)}`}>
          {node.status}
        </span>

        {/* Progress */}
        {node.type !== "task" && node.type !== "action" && (
          <div className="shrink-0 flex items-center gap-1">
            <div className="w-10 h-1.5 rounded-full bg-muted/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${node.progress >= 80 ? "bg-orq8-green" : node.progress >= 50 ? "bg-amber-500" : "bg-muted/40"}`}
                style={{ width: `${node.progress}%` }}
              />
            </div>
            <span className="text-2xs font-mono text-muted w-7 text-right">{node.progress}%</span>
          </div>
        )}

        {/* Task status icon */}
        {node.type === "task" && (
          <span className="shrink-0">
            {node.status === "completed" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-orq8-green" />
            ) : node.status === "failed" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-muted" />
            )}
          </span>
        )}

        {/* Agent */}
        {node.agentName && (
          <span className="shrink-0 rounded-full bg-orq8-green/10 px-1.5 py-0.5 text-2xs font-medium text-orq8-green">
            {node.agentName}
          </span>
        )}

        {/* Child count */}
        {hasChildren && (
          <span className="shrink-0 rounded-full bg-muted/10 px-1.5 py-0.5 font-mono text-3xs text-muted">
            {node.children.length}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="border-l border-hairline/50 ml-4">
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function LineagePage() {
  const [tree, setTree] = useState<LineageNode[]>([]);
  const [score, setScore] = useState<LineageScore | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [treeData, scoreData] = await Promise.all([fetchTree(), fetchScore()]);
    setTree(treeData);
    setScore(scoreData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Count nodes by type
  const countByType = (nodes: LineageNode[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
      const childCounts = countByType(n.children);
      for (const [k, v] of Object.entries(childCounts)) {
        counts[k] = (counts[k] ?? 0) + v;
      }
    }
    return counts;
  };

  const nodeCounts = countByType(tree);

  return (
    <PageErrorBoundary pageName="Strategic Lineage" backHref="/app">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-ink">Strategic Lineage</h1>
          <p className="mt-1 text-sm text-muted">
            Trace every task back to company strategy. See how work connects to goals.
          </p>
        </div>

        {/* Score + Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="h-4 w-4 text-orq8-green" />
              <span className="text-xs font-medium text-muted">Lineage Score</span>
            </div>
            <div className="text-2xl font-bold text-ink font-mono">{score?.lineageScore ?? 0}%</div>
            <div className="mt-2 h-1.5 rounded-full bg-muted/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${(score?.lineageScore ?? 0) >= 70 ? "bg-orq8-green" : (score?.lineageScore ?? 0) >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${score?.lineageScore ?? 0}%` }}
              />
            </div>
            <div className="text-2xs text-muted mt-1">
              {score?.deepLinkedTasks ?? 0} of {score?.totalActiveTasks ?? 0} active tasks traced
            </div>
          </div>

          <div className="rounded-xl border border-hairline bg-white p-5">
            <div className="text-2xl font-bold text-ink font-mono">{tree.length}</div>
            <div className="text-2xs text-muted mt-1">Active Strategies</div>
            <div className="mt-2 text-xs text-muted">
              {(nodeCounts["objective"] ?? 0)} objectives • {(nodeCounts["key_result"] ?? 0)} key results
            </div>
          </div>

          <div className="rounded-xl border border-hairline bg-white p-5">
            <div className="text-2xl font-bold text-orq8-orange font-mono">{nodeCounts["initiative"] ?? 0}</div>
            <div className="text-2xs text-muted mt-1">Initiatives</div>
            <div className="mt-2 text-xs text-muted">
              {(nodeCounts["task"] ?? 0)} tasks in tree
            </div>
          </div>

          <div className="rounded-xl border border-hairline bg-white p-5">
            <div className="text-2xl font-bold text-red-500 font-mono">{score?.orphanedTasks ?? 0}</div>
            <div className="text-2xs text-muted mt-1">Orphaned Tasks</div>
            <div className="mt-2 text-xs text-muted">
              Tasks without strategy linkage
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-2xs text-muted">
          <span>📐 Strategy</span>
          <span>🎯 Objective</span>
          <span>📏 Key Result</span>
          <span>⚡ Initiative</span>
          <span>📋 Task</span>
        </div>

        {/* Tree */}
        <div className="mt-6">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted">Loading lineage tree…</div>
          ) : tree.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-10 text-center">
              <GitBranch className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No strategies yet</p>
              <p className="mt-1 text-xs text-muted">
                Create a strategy on the Strategy page to start building strategic lineage.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-hairline bg-white p-4 space-y-1">
              {tree.map(node => (
                <TreeNode key={node.id} node={node} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageErrorBoundary>
  );
}
