"use client";

import React, { useEffect, useId, useState } from "react";
import { Check, Plus, Plug, UserPlus, Workflow } from "lucide-react";

import { usePrototype } from "../state/store";
import { Button, Eyebrow, FOCUS } from "./ui";

export type DialogState =
  | { kind: "hire"; departmentId: string }
  | { kind: "department" }
  | { kind: "work"; departmentId: string }
  | { kind: "tool" }
  | { kind: "notes" }
  | null;

const AVAILABLE_TOOLS = [
  { name: "Linear", purpose: "Mirror engineering work items into the tracker" },
  { name: "HubSpot", purpose: "Read pipeline activity for Sales" },
  { name: "Stripe", purpose: "Report revenue into Finance" },
  { name: "Notion", purpose: "Publish briefings the company can read" },
];

function PrototypeDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-hairline bg-surface-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow as="p">Prototype action</Eyebrow>
            <h2 id={titleId} className="mt-1 text-md font-semibold text-ink">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-2xs text-ink-muted">
              {description}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const FIELD = `w-full rounded-lg border border-border-strong bg-surface-white px-3 py-2 text-2sm text-ink placeholder:text-ink-faint outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] focus-visible:ring-offset-1`;
const LABEL = "text-2xs font-medium text-ink";

/**
 * Keyed by the dialog, so every action starts from clean fields and the
 * department it was opened from (a stale selection here hired into the wrong
 * department once, which is exactly the kind of prototype bug that misleads a
 * review).
 */
export function QuickActionDialog({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  const key = dialog ? `${dialog.kind}:${dialog.kind === "hire" || dialog.kind === "work" ? dialog.departmentId : ""}` : "closed";
  return <QuickActionDialogInner key={key} dialog={dialog} onClose={onClose} />;
}

function QuickActionDialogInner({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  const { state, dispatch } = usePrototype();
  const [departmentId, setDepartmentId] = useState(
    dialog && "departmentId" in dialog ? dialog.departmentId : state.departments[0]?.id ?? "",
  );
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");

  if (!dialog) return null;

  if (dialog.kind === "hire") {
    const department = state.departments.find((d) => d.id === departmentId);
    return (
      <PrototypeDialog
        title="Hire an AI employee"
        description="It joins the department you choose, appears in the organization immediately, and counts toward the company state."
        onClose={onClose}
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !role.trim() || !department) return;
            dispatch({ type: "hire", departmentId: department.id, name: name.trim(), role: role.trim() });
            onClose();
          }}
        >
          <div className="grid gap-1.5">
            <label className={LABEL} htmlFor="hire-department">
              Department
            </label>
            <select
              id="hire-department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className={FIELD}
            >
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <p className="text-2xs text-ink-faint">{department?.mandate}</p>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label className={LABEL} htmlFor="hire-name">
                Name
              </label>
              <input
                id="hire-name"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder="Iris"
                className={FIELD}
              />
            </div>
            <div className="grid gap-1.5">
              <label className={LABEL} htmlFor="hire-role">
                Role
              </label>
              <input
                id="hire-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Lifecycle marketer"
                className={FIELD}
              />
            </div>
          </div>
          <p className="text-2xs text-ink-faint">
            New hires start in Manual mode with Can do authority, so nothing spends money until you widen it.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!name.trim() || !role.trim()} className="disabled:opacity-50">
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Hire
            </Button>
          </div>
        </form>
      </PrototypeDialog>
    );
  }

  if (dialog.kind === "department") {
    return (
      <PrototypeDialog
        title="Add a department"
        description="A department is an organizational unit the Executive Agent can route work to. It starts with an empty roster."
        onClose={onClose}
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            dispatch({ type: "add-department", name: name.trim() });
            onClose();
          }}
        >
          <div className="grid gap-1.5">
            <label className={LABEL} htmlFor="department-name">
              Department name
            </label>
            <input
              id="department-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Legal"
              className={FIELD}
            />
          </div>
          <p className="text-2xs text-ink-faint">
            It appears in the organization map straight away, in the counts, and in the Executive Agent's summary.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!name.trim()} className="disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add department
            </Button>
          </div>
        </form>
      </PrototypeDialog>
    );
  }

  if (dialog.kind === "work") {
    const department = state.departments.find((d) => d.id === departmentId);
    const owner = state.agents.find((a) => a.departmentId === departmentId);
    return (
      <PrototypeDialog
        title="Create work"
        description="The Executive Agent assigns new work to the department lead, who then owns the steps."
        onClose={onClose}
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || !department) return;
            dispatch({ type: "create-work", departmentId: department.id, title: title.trim() });
            onClose();
          }}
        >
          <div className="grid gap-1.5">
            <label className={LABEL} htmlFor="work-department">
              Department
            </label>
            <select
              id="work-department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className={FIELD}
            >
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className={LABEL} htmlFor="work-title">
              What needs doing
            </label>
            <input
              id="work-title"
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Draft the security review answer"
              className={FIELD}
            />
          </div>
          <p className="text-2xs text-ink-faint">
            {owner
              ? `${owner.name} (${owner.role.toLowerCase()}) will pick this up in ${department?.name}.`
              : "This department has no AI employees yet, so work cannot be assigned. Hire one first."}
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!title.trim() || !owner}
              className="disabled:opacity-50"
            >
              <Workflow className="h-3.5 w-3.5" aria-hidden />
              Create work
            </Button>
          </div>
        </form>
      </PrototypeDialog>
    );
  }

  if (dialog.kind === "tool") {
    return (
      <PrototypeDialog
        title="Connect a tool"
        description="Tool connections are simulated here: nothing is authorised, and no OAuth flow runs."
        onClose={onClose}
      >
        <ul className="grid gap-2">
          {AVAILABLE_TOOLS.map((tool) => {
            const connected = state.tools.includes(tool.name);
            return (
              <li
                key={tool.name}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-white px-3 py-2"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-surface-secondary text-text-brand">
                  <Plug className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2sm font-medium text-ink">{tool.name}</span>
                  <span className="block text-2xs text-ink-muted">{tool.purpose}</span>
                </span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-2xs font-medium text-brand-ink">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Connected
                  </span>
                ) : (
                  <Button onClick={() => dispatch({ type: "connect-tool", name: tool.name })}>Connect</Button>
                )}
              </li>
            );
          })}
        </ul>
      </PrototypeDialog>
    );
  }

  return (
    <PrototypeDialog
      title="What is simulated"
      description="The honest boundary of this prototype, so nothing here is mistaken for the product."
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Eyebrow as="h3">Simulated here</Eyebrow>
          <ul className="mt-2 grid gap-1.5 text-2xs text-ink-muted">
            <li>NovaForge AI, its departments, AI employees, work, activity and memory</li>
            <li>Executive Agent answers, computed from the board on this page</li>
            <li>Hiring, adding a department, creating work and connecting a tool</li>
            <li>Approve and reject, including the state change they cause</li>
            <li>Every count, which is derived from the arrays in memory</li>
          </ul>
        </div>
        <div>
          <Eyebrow as="h3">Not connected</Eyebrow>
          <ul className="mt-2 grid gap-1.5 text-2xs text-ink-muted">
            <li>Your company, or any real account data</li>
            <li>The ORQ8 API, database and agent runtime</li>
            <li>Real credits, spend, permissions or tool authorisations</li>
            <li>Company memory, email and notifications</li>
          </ul>
          <p className="mt-3 text-2xs text-ink-faint">
            Nothing you do on this page leaves the browser, and the current dashboard is untouched. Use the
            &ldquo;Open the current dashboard&rdquo; link to compare.
          </p>
        </div>
      </div>
    </PrototypeDialog>
  );
}

export { AVAILABLE_TOOLS, FOCUS };
