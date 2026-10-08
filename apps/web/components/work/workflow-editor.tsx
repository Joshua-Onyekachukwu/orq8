"use client";

/**
 * Workflow editor (docs/85 P2) — the recurring processes a department owns.
 *
 * ORQ8's workflows ARE event rules: an external event (github / linear / gmail)
 * matches a rule, and the rule either notifies, creates work for a named
 * employee, or is ignored. `PUT /v1/event-rules` upserts on
 * (provider, eventType), so the editor is create-and-edit in one control, and a
 * rule can be switched off rather than deleted.
 *
 * The contract is not re-derived here — provider/action enum values, the
 * agent-must-be-a-member guard and the audit entry all live on the API. This
 * component posts what the user chose and reports the API's answer.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { OsEmptyPanel, OsErrorPanel } from "../os/structure";

const PROVIDERS = ["github", "linear", "gmail"] as const;
const ACTIONS = ["create_task", "notify", "ignore"] as const;

type Provider = (typeof PROVIDERS)[number];
type Action = (typeof ACTIONS)[number];

export interface WorkflowRule {
  id: string;
  provider: string;
  eventType: string;
  action: string;
  requiresApproval: boolean;
  enabled: boolean;
  agentId: string | null;
  agentName?: string | null;
  taskTitleTemplate?: string | null;
}

export interface WorkflowMember {
  id: string;
  name: string;
  role: string;
}

/** Common event types per provider, offered as datalist suggestions only. */
const EVENT_SUGGESTIONS: Record<Provider, string[]> = {
  github: ["pull_request.opened", "pull_request.closed", "issues.opened", "push"],
  linear: ["issue.created", "issue.updated", "issue.completed"],
  gmail: ["message.received"],
};

interface Draft {
  provider: Provider;
  eventType: string;
  action: Action;
  agentId: string;
  taskTitleTemplate: string;
  requiresApproval: boolean;
  enabled: boolean;
}

const EMPTY: Draft = {
  provider: "github",
  eventType: "",
  action: "create_task",
  agentId: "",
  taskTitleTemplate: "",
  requiresApproval: true,
  enabled: true,
};

function draftFrom(rule: WorkflowRule): Draft {
  return {
    provider: (PROVIDERS as readonly string[]).includes(rule.provider)
      ? (rule.provider as Provider)
      : "github",
    eventType: rule.eventType,
    action: (ACTIONS as readonly string[]).includes(rule.action)
      ? (rule.action as Action)
      : "create_task",
    agentId: rule.agentId ?? "",
    taskTitleTemplate: rule.taskTitleTemplate ?? "",
    requiresApproval: rule.requiresApproval,
    enabled: rule.enabled,
  };
}

const inputCls =
  "w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none";

export function WorkflowEditor({
  rules,
  members,
}: {
  rules: WorkflowRule[];
  members: WorkflowMember[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(d: Draft, isEdit: boolean) {
    if (!d.eventType.trim()) {
      setError("An event type is required (e.g. issues.opened).");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/event-rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: d.provider,
          eventType: d.eventType.trim(),
          action: d.action,
          agentId: d.agentId || null,
          taskTitleTemplate: d.taskTitleTemplate.trim() || null,
          requiresApproval: d.requiresApproval,
          enabled: d.enabled,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (!res.ok) {
        const message =
          typeof body?.error === "string"
            ? body.error
            : (body?.error as { message?: string } | undefined)?.message ??
              "Could not save this workflow.";
        setError(message);
        return;
      }
      setNotice(
        isEdit
          ? `Updated the ${d.provider} · ${d.eventType.trim()} workflow.`
          : `Added the ${d.provider} · ${d.eventType.trim()} workflow.`,
      );
      setDraft(null);
      router.refresh();
    } catch {
      setError("Could not reach the ORQ8 API.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(rule: WorkflowRule) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/event-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete this workflow.");
        return;
      }
      setNotice(`Deleted the ${rule.provider} · ${rule.eventType} workflow.`);
      router.refresh();
    } catch {
      setError("Could not reach the ORQ8 API.");
    } finally {
      setBusy(false);
    }
  }

  function Form({ mode }: { mode: "new" | "edit" }) {
    if (!draft) return null;
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    return (
      <form
        className="rounded-lg border border-hairline-strong bg-canvas p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save(draft, mode === "edit");
        }}
      >
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          {mode === "edit" ? "Edit workflow" : "New workflow"}
        </p>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label className="text-2xs text-muted">
            Source
            <select
              className={`mt-1 ${inputCls}`}
              value={draft.provider}
              onChange={(e) => set({ provider: e.target.value as Provider })}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-2xs text-muted">
            Event type
            <input
              className={`mt-1 ${inputCls}`}
              value={draft.eventType}
              list="workflow-event-suggestions"
              onChange={(e) => set({ eventType: e.target.value })}
              placeholder="issues.opened"
            />
            <datalist id="workflow-event-suggestions">
              {EVENT_SUGGESTIONS[draft.provider].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="text-2xs text-muted">
            Then
            <select
              className={`mt-1 ${inputCls}`}
              value={draft.action}
              onChange={(e) => set({ action: e.target.value as Action })}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-2xs text-muted">
            Assigned employee
            <select
              className={`mt-1 ${inputCls}`}
              value={draft.agentId}
              onChange={(e) => set({ agentId: e.target.value })}
            >
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.role.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          {draft.action === "create_task" ? (
            <label className="text-2xs text-muted sm:col-span-2">
              Task title template
              <input
                className={`mt-1 ${inputCls}`}
                value={draft.taskTitleTemplate}
                onChange={(e) => set({ taskTitleTemplate: e.target.value })}
                placeholder="Review {{event.title}}"
              />
            </label>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="inline-flex items-center gap-2 text-2xs text-muted">
            <input
              type="checkbox"
              checked={draft.requiresApproval}
              onChange={(e) => set({ requiresApproval: e.target.checked })}
            />
            Needs founder approval before it runs
          </label>
          <label className="inline-flex items-center gap-2 text-2xs text-muted">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-hairline-strong px-3 py-1 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "edit" ? "Save workflow" : "Add workflow"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="rounded-md border border-hairline px-3 py-1 text-2xs text-muted transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {notice ? (
        <p className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-xs text-ink">{notice}</p>
      ) : null}
      {error ? <OsErrorPanel title="Workflow not saved" detail={error} /> : null}

      {draft === null ? (
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setNotice(null);
          }}
          className="rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-ink transition-colors hover:bg-surface-secondary"
        >
          New workflow
        </button>
      ) : (
        <Form mode="new" />
      )}

      {rules.length === 0 && draft === null ? (
        <OsEmptyPanel
          title="No workflows yet."
          hint="A workflow turns an external event into work for this department — e.g. a new GitHub issue becomes a task for the engineering lead."
        />
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-hairline bg-canvas px-3.5 py-2.5"
            >
              <span className="font-mono text-2xs tracking-wide text-muted uppercase">
                {rule.provider} · {rule.eventType}
              </span>
              <span className="text-xs text-ink">
                → {rule.action.replace(/_/g, " ")}
                {rule.taskTitleTemplate ? `: “${rule.taskTitleTemplate}”` : ""}
              </span>
              <span className="text-2xs text-muted">
                {rule.agentId
                  ? (members.find((m) => m.id === rule.agentId)?.name ?? rule.agentName ?? "employee")
                  : "unassigned"}
                {rule.requiresApproval ? " · needs approval" : ""}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-3xs tracking-wide uppercase ${
                  rule.enabled ? "bg-ink text-white" : "border border-hairline text-muted"
                }`}
              >
                {rule.enabled ? "on" : "off"}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(draftFrom(rule));
                    setNotice(null);
                  }}
                  className="rounded-md border border-hairline px-2.5 py-1 text-2xs text-muted transition-colors hover:text-ink disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(rule)}
                  className="rounded-md border border-hairline px-2.5 py-1 text-2xs text-error-ink transition-colors hover:border-error-ink disabled:opacity-50"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
