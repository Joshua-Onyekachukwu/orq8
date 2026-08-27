"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";

interface TaskActionsProps {
  taskId?: string;
  currentStatus?: string;
}

export function TaskActions({ taskId, currentStatus }: TaskActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });

  // If editing an existing task's status
  if (taskId && currentStatus) {
    const nextStatus =
      currentStatus === "pending"
        ? "in_progress"
        : currentStatus === "in_progress"
        ? "completed"
        : null;
    if (!nextStatus) return null;
    return (
      <button
        onClick={async () => {
          await fetch(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          });
          window.location.reload();
        }}
        className="font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald hover:underline"
      >
        {nextStatus === "in_progress" ? "Start" : "Complete"}
      </button>
    );
  }

  // Create task button / modal
  if (!taskId) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
        >
          <Plus className="h-3 w-3" /> Add Task
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60">
            <div className="w-full max-w-md rounded-xl border border-hairline bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Create Task</h3>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!form.title.trim()) return;
                  setLoading(true);
                  await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
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
                    placeholder="Research competitor pricing"
                    className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What needs to be done?"
                    rows={3}
                    className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-emerald"
                  />
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
                    Create Task
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
