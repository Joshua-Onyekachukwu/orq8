"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";

interface AgentOption {
  id: string;
  name: string;
  role: string;
}

interface TaskActionsProps {
  taskId?: string;
  currentStatus?: string;
  goalId?: string; // pre-fill goal when creating from a goal card
  agents?: AgentOption[]; // available agents for assignment
}

export function TaskActions({ taskId, currentStatus, goalId, agents }: TaskActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "normal",
    dueDate: "",
    agentId: "",
  });

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
        className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#1a5c2e] hover:underline"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0b]/60">
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
                  const body: Record<string, unknown> = {
                    title: form.title,
                    description: form.description || undefined,
                    priority: form.priority,
                  };
                  if (goalId) body.goalId = goalId;
                  if (form.dueDate) body.dueDate = new Date(form.dueDate).toISOString();
                  if (form.agentId) body.agentId = form.agentId;
                  await fetch("/api/tasks", {
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
                    placeholder="Research competitor pricing"
                    className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-[#1a5c2e]"
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
                    className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-[#1a5c2e]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink">Priority</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-[#1a5c2e]"
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
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-[#1a5c2e]"
                    />
                  </div>
                </div>
                {agents && agents.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink">Assign to Agent</label>
                    <select
                      value={form.agentId}
                      onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-[#1a5c2e]"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.role.replace(/_/g, " ")})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                    className="flex items-center gap-1.5 rounded-lg bg-[#0a0a0b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B8FF66] hover:text-white disabled:opacity-50"
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
