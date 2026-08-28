"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";

interface GoalActionsProps {
  goalId?: string;
  currentStatus?: string;
}

export function GoalActions({ goalId, currentStatus }: GoalActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal", dueDate: "" });

  // If editing an existing goal's status, show simple status toggles
  if (goalId && currentStatus) {
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      return (
        <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
          {currentStatus}
        </span>
      );
    }
    return (
      <form
        action={`/api/goals/${goalId}`}
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          const nextStatus = currentStatus === "active" ? "completed" : "active";
          await fetch(`/api/goals/${goalId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: nextStatus,
              progress: nextStatus === "completed" ? 100 : undefined,
            }),
          });
          window.location.reload();
        }}
      >
        <button
          type="submit"
          className="font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald hover:underline"
        >
          {currentStatus === "active" ? "Complete" : "Reactivate"}
        </button>
      </form>
    );
  }

  // Create goal button / modal
  if (!goalId) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
        >
          <Plus className="h-3.5 w-3.5" /> New Goal
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60">
            <div className="w-full max-w-md rounded-xl border border-hairline bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Create Goal</h3>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!form.title.trim()) return;
                  setLoading(true);
                  const body: Record<string, unknown> = {
                    title: form.title,
                    description: form.description || undefined,
                    priority: form.priority,
                  };
                  if (form.dueDate) body.dueDate = new Date(form.dueDate).toISOString();
                  await fetch("/api/goals", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  window.location.reload();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Launch newsletter by Q4"
                    className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What does this goal aim to achieve?"
                    rows={3}
                    className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink">Priority</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink">Due Date</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-hairline px-4 py-2 text-xs font-medium text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !form.title.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-lime hover:text-navy-950 disabled:opacity-50"
                  >
                    {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create Goal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
