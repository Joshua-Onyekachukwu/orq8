"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

/**
 * The four authority bands (docs/71 §H): CAN DO / CAN SPEND / REQUIRES
 * APPROVAL / CANNOT DO.
 *
 * This is the governance surface, so it renders the real `authority` jsonb and
 * writes back through `PATCH /v1/agents/:id` — the same column the execution
 * path reads when it decides whether an action may run. Nothing here is
 * decorative: every switch is a server-enforced permission.
 */

export interface AgentAuthority {
  canCreateTasks?: boolean;
  canExecuteTasks?: boolean;
  canAccessCompanyInfo?: boolean;
  canCommunicateExternally?: boolean;
  canModifyResources?: boolean;
  spendingLimitCents?: number;
  requiresApprovalFor?: string[];
  forbiddenActions?: string[];
}

export const AUTHORITY_DEFAULTS: Required<Omit<AgentAuthority, "spendingLimitCents">> & {
  spendingLimitCents: number;
} = {
  canCreateTasks: true,
  canExecuteTasks: true,
  canAccessCompanyInfo: true,
  canCommunicateExternally: false,
  canModifyResources: false,
  spendingLimitCents: 0,
  requiresApprovalFor: [],
  forbiddenActions: [],
};

const CAN_DO: Array<{ key: keyof AgentAuthority; label: string; hint: string }> = [
  {
    key: "canCreateTasks",
    label: "Create tasks",
    hint: "Write work into the company's backlog on its own initiative.",
  },
  {
    key: "canExecuteTasks",
    label: "Execute tasks",
    hint: "Actually run work rather than only proposing it.",
  },
  {
    key: "canAccessCompanyInfo",
    label: "Read company knowledge",
    hint: "Search files, memory and performance history while working.",
  },
  {
    key: "canCommunicateExternally",
    label: "Contact outside the company",
    hint: "Email or message customers, partners and prospects.",
  },
  {
    key: "canModifyResources",
    label: "Change files and records",
    hint: "Edit or delete stored resources, not just read them.",
  },
];

/** The four gates the product ships with — offered as quick-adds, never forced. */
const APPROVAL_SUGGESTIONS = [
  "financial_commitments",
  "external_communications",
  "irreversible_actions",
  "high_impact_decisions",
];

export function titleize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function authorityDirty(from: AgentAuthority, to: AgentAuthority): boolean {
  const keys: Array<keyof AgentAuthority> = [
    "canCreateTasks",
    "canExecuteTasks",
    "canAccessCompanyInfo",
    "canCommunicateExternally",
    "canModifyResources",
    "spendingLimitCents",
  ];
  for (const key of keys) {
    if ((from[key] ?? false) !== (to[key] ?? false)) return true;
  }
  if (!sameList(from.requiresApprovalFor ?? [], to.requiresApprovalFor ?? [])) return true;
  if (!sameList(from.forbiddenActions ?? [], to.forbiddenActions ?? [])) return true;
  return false;
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-secondary"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors ${
          checked ? "border-brand-deep bg-brand-deep/20" : "border-hairline-strong bg-transparent"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full transition-all ${
            checked ? "translate-x-3.5 bg-brand-deep" : "translate-x-[3px] bg-muted"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-2xs leading-relaxed text-muted">{hint}</span>
      </span>
    </button>
  );
}

function ChipList({
  items,
  tone,
  onRemove,
}: {
  items: string[];
  tone: "warn" | "danger";
  onRemove: (item: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline px-3 py-3 text-xs text-muted">
        Nothing listed.
      </p>
    );
  }
  const toneClass =
    tone === "warn"
      ? "border-hairline-strong text-ink"
      : "border-error-soft text-error-ink";
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs ${toneClass}`}
        >
          {titleize(item)}
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label={`Remove ${titleize(item)}`}
            className="text-muted transition-colors hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddRow({
  placeholder,
  onAdd,
  suggestions,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
  suggestions?: string[];
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const next = value.trim().replace(/\s+/g, "_").toLowerCase();
    if (!next) return;
    onAdd(next);
    setValue("");
  };
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-hairline-strong px-2.5 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-3xs uppercase tracking-wide text-muted">Common:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAdd(s)}
              className="rounded-full border border-hairline px-2 py-0.5 text-2xs text-muted transition-colors hover:border-hairline-strong hover:text-ink"
            >
              {titleize(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Band({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <section className="console-card p-4">
      <header className="flex items-baseline gap-2">
        <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </h3>
        <p className="ml-auto text-2xs text-muted">{caption}</p>
      </header>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export function AuthorityPanel({
  authority,
  dirty,
  saving,
  onDraftChange,
  onSave,
  onDiscard,
  onAutonomyChange,
  autonomyLevel,
}: {
  authority: AgentAuthority;
  dirty: boolean;
  saving: boolean;
  onDraftChange: (next: AgentAuthority) => void;
  onSave: () => void;
  onDiscard: () => void;
  autonomyLevel: string;
  onAutonomyChange: (level: string) => void;
}) {
  const set = (patch: Partial<AgentAuthority>) => onDraftChange({ ...authority, ...patch });
  const approvals = authority.requiresApprovalFor ?? [];
  const forbidden = authority.forbiddenActions ?? [];
  const spendingDollars = ((authority.spendingLimitCents ?? 0) / 100).toFixed(2);

  const autonomyOptions = [
    { value: "observe", label: "Observe", hint: "Read and research only — cannot execute work." },
    { value: "recommend", label: "Recommend", hint: "Executes internally; results are advisory to you." },
    { value: "draft", label: "Draft", hint: "May draft external content, never sends it." },
    {
      value: "execute_with_approval",
      label: "Approval",
      hint: "Consequential actions wait for you.",
    },
    { value: "autonomous", label: "Autonomous", hint: "Executes within its authority and budget." },
  ];

  return (
    <div className="space-y-3">
      <Band
        label="Can do"
        caption={authority.canExecuteTasks === false ? "execution off" : "switches apply immediately"}
      >
        <div className="-mx-2 space-y-0.5">
          {CAN_DO.map((row) => (
            <Toggle
              key={row.key}
              label={row.label}
              hint={row.hint}
              checked={Boolean(authority[row.key])}
              onChange={(next) => set({ [row.key]: next } as Partial<AgentAuthority>)}
            />
          ))}
        </div>
      </Band>

      <Band label="Can spend" caption="per action">
        <div className="flex flex-wrap items-center gap-3 px-2 py-1">
          <span className="text-sm text-ink">Up to</span>
          <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas px-2 py-1.5">
            <span className="font-mono text-xs text-muted">$</span>
            <input
              type="number"
              min={0}
              step={1}
              value={spendingDollars}
              onChange={(e) => {
                const dollars = Number(e.target.value);
                set({
                  spendingLimitCents: Number.isFinite(dollars)
                    ? Math.max(0, Math.round(dollars * 100))
                    : 0,
                });
              }}
              className="w-20 bg-transparent text-sm tabular-nums text-ink focus:outline-none"
              aria-label="Spending limit in dollars"
            />
          </span>
          <span className="text-sm text-muted">per action without asking you.</span>
        </div>
        <p className="px-2 pt-1 text-2xs leading-relaxed text-muted">
          {(authority.spendingLimitCents ?? 0) === 0
            ? "Set to $0.00 — this employee must get your approval before spending anything."
            : "Anything above this amount is raised to your attention queue as an approval."}
        </p>
      </Band>

      <Band label="Requires approval" caption={`${approvals.length} gate${approvals.length === 1 ? "" : "s"}`}>
        <ChipList
          items={approvals}
          tone="warn"
          onRemove={(item) => set({ requiresApprovalFor: approvals.filter((a) => a !== item) })}
        />
        <AddRow
          placeholder="Add an action that stops for you…"
          suggestions={APPROVAL_SUGGESTIONS.filter((s) => !approvals.includes(s))}
          onAdd={(value) => {
            if (approvals.includes(value)) return;
            set({ requiresApprovalFor: [...approvals, value] });
          }}
        />
      </Band>

      <Band label="Cannot do" caption="hard stops, never allowed">
        <ChipList
          items={forbidden}
          tone="danger"
          onRemove={(item) => set({ forbiddenActions: forbidden.filter((a) => a !== item) })}
        />
        <AddRow
          placeholder="Add something this employee must never do…"
          onAdd={(value) => {
            if (forbidden.includes(value)) return;
            set({ forbiddenActions: [...forbidden, value] });
          }}
        />
      </Band>

      <Band label="Autonomy" caption="enforced in the execution path">
        <div className="space-y-1">
          {autonomyOptions.map((option) => {
            const active = autonomyLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onAutonomyChange(option.value)}
                aria-pressed={active}
                className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-hairline-strong bg-elevated"
                    : "border-transparent hover:border-hairline hover:bg-surface-secondary"
                }`}
              >
                <ChevronRight
                  aria-hidden="true"
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? "text-ink" : "text-muted/50"}`}
                />
                <span className="min-w-0">
                  <span className={`block text-sm ${active ? "text-ink" : "text-ink/90"}`}>
                    {option.label}
                  </span>
                  <span className="block text-2xs leading-relaxed text-muted">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Band>

      {dirty && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-hairline-strong bg-elevated px-3 py-2.5">
          <span className="text-xs text-ink">Unsaved authority changes.</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-warm px-3 py-1.5 text-xs font-semibold text-on-warm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save authority"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
