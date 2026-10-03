"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";

import { AgentDrawer, type AgentDrawerTarget, type DrawerDotState } from "../agents/agent-drawer";

/**
 * "What's happening now" (brief §1–§4) — the live operational view of the
 * company.
 *
 * Composition: a status strip that states the counts, an attention band for
 * employees that need the founder, large working cards for employees doing
 * work right now, a compact rail for everyone else, and a per-card latest
 * change. Clicking any employee opens the detail drawer over the dashboard.
 *
 * Every value rendered here is derived server-side from the employee's own
 * rows, the org's pending approvals and the activity feed — the component
 * never invents a task, a progress number or an event. A missing value is
 * shown as missing.
 */

export type HappeningState = "working" | "needs_you" | "blocked" | "waiting" | "idle" | "paused" | "retired";

export interface HappeningMember {
  id: string;
  name: string;
  roleLabel: string;
  departmentName: string | null;
  isLead: boolean;
  state: HappeningState;
  stateLabel: string;
  dotState: DrawerDotState;
  currentTask: string | null;
  latestChange: { tag: string; color: string; summary: string; clock: string } | null;
  lastActiveLabel: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  weeklyCostLabel: string | null;
  /** For employees waiting on a founder decision: what the decision is. */
  ask: string | null;
  actionHref: string | null;
  actionLabel: string | null;
}

export interface HappeningDepartment {
  id: string;
  name: string;
  employees: number;
  working: number;
  needsYou: number;
}

const ATTENTION_STATES: HappeningState[] = ["needs_you", "blocked", "waiting"];

function StatusPill({ state, label }: { state: HappeningState; label: string }) {
  const tone =
    state === "working"
      ? { color: "var(--orq-mark-active)", border: "var(--orq-border-strong)" }
      : state === "blocked"
        ? { color: "var(--orq-error)", border: "var(--orq-border-error)" }
        : state === "needs_you" || state === "waiting"
          ? { color: "var(--orq-warm)", border: "var(--orq-border-strong)" }
          : { color: "var(--orq-text-secondary)", border: "var(--orq-border)" };
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide"
      style={{ color: tone.color, borderColor: tone.border }}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${state === "working" ? "animate-pulse" : ""}`}
        style={{ background: tone.color }}
      />
      {label}
    </span>
  );
}

function WorkCard({
  member,
  onOpen,
}: {
  member: HappeningMember;
  onOpen: (member: HappeningMember) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(member)}
      className="group relative flex w-full flex-col overflow-hidden rounded-lg border border-hairline bg-elevated p-4 text-left transition-colors hover:border-hairline-strong hover:bg-surface-secondary"
    >
      {/* The live rail: working cards carry the only motion in the section. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: "var(--orq-mark-active)" }}
      />
      <div className="flex items-start gap-3 pl-1">
        <span
          aria-hidden="true"
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-canvas text-base font-semibold text-ink"
        >
          {member.name.charAt(0).toUpperCase()}
          <span
            className="state-dot absolute -bottom-0.5 -right-0.5"
            data-state="working"
            style={{ boxShadow: "0 0 0 2px var(--orq-surface-white)" }}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-semibold leading-tight text-ink">
              {member.name}
            </span>
            {member.isLead && (
              <span className="shrink-0 rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-muted">
                Lead
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate font-mono text-2xs text-muted">
            {member.roleLabel}
            {member.departmentName ? ` · ${member.departmentName}` : ""}
          </span>
        </span>
        <StatusPill state={member.state} label={member.stateLabel} />
      </div>

      <div className="mt-3.5 pl-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Working on</p>
        <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink">
          {member.currentTask ?? "No task text recorded."}
        </p>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-hairline pt-2.5 pl-1 text-2xs">
        <span className="min-w-0 truncate text-muted">
          {member.latestChange ? (
            <>
              <span
                className="mr-1.5 font-mono font-semibold"
                style={{ color: member.latestChange.color }}
              >
                {member.latestChange.tag}
              </span>
              {member.latestChange.summary}
            </>
          ) : member.lastActiveLabel ? (
            <>Active {member.lastActiveLabel} · no events recorded</>
          ) : (
            <>No events recorded yet</>
          )}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-muted">
          {member.tasksCompleted} done
          {member.weeklyCostLabel ? ` · ${member.weeklyCostLabel}` : ""}
        </span>
      </div>
    </button>
  );
}

function AttentionCard({
  member,
  onOpen,
}: {
  member: HappeningMember;
  onOpen: (member: HappeningMember) => void;
}) {
  const blocked = member.state === "blocked";
  const accent = blocked ? "var(--orq-error)" : "var(--orq-warm)";
  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-3.5"
      style={{
        borderColor: blocked ? "var(--orq-border-error)" : "var(--orq-border-strong)",
        background: blocked ? "var(--orq-error-soft)" : "var(--orq-warm-soft)",
      }}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-canvas text-xs font-semibold text-ink"
        style={{ borderColor: accent }}
      >
        {member.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* The padding is the touch target: 20px of text grows to a 40px tap
              area without moving the label (mobile check, brief §17). */}
          <button
            type="button"
            onClick={() => onOpen(member)}
            className="-my-2.5 py-2.5 text-sm font-semibold text-ink hover:underline"
          >
            {member.name}
          </button>
          <StatusPill state={member.state} label={member.stateLabel} />
          <span className="font-mono text-2xs text-muted">
            {member.roleLabel}
            {member.departmentName ? ` · ${member.departmentName}` : ""}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink">
          {member.ask ?? member.latestChange?.summary ?? "No detail recorded."}
        </p>
        {member.actionHref && member.actionLabel && (
          <Link
            href={member.actionHref}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 font-mono text-2xs uppercase tracking-wide transition-colors hover:bg-surface-secondary"
            style={{ color: accent, borderColor: accent }}
          >
            {member.actionLabel}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

function RestRail({
  members,
  onOpen,
}: {
  members: HappeningMember[];
  onOpen: (member: HappeningMember) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Available / paused
      </span>
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          onClick={() => onOpen(member)}
          className="inline-flex items-center gap-2 rounded-full border border-hairline bg-elevated px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-hairline-strong hover:bg-surface-secondary"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-hairline bg-canvas text-[10px] font-semibold"
          >
            {member.name.charAt(0).toUpperCase()}
          </span>
          {member.name}
          <span className="font-mono text-2xs uppercase tracking-wide text-muted">
            {member.stateLabel}
          </span>
          <span className="state-dot" data-state={member.dotState} />
        </button>
      ))}
    </div>
  );
}

export function WhatsHappeningNow({
  members,
  departments = [],
}: {
  members: HappeningMember[];
  departments?: HappeningDepartment[];
}) {
  const [selected, setSelected] = useState<HappeningMember | null>(null);

  const attention = members.filter((m) => ATTENTION_STATES.includes(m.state));
  const working = members.filter((m) => m.state === "working");
  const rest = members.filter((m) => !ATTENTION_STATES.includes(m.state) && m.state !== "working");
  const counts = {
    working: working.length,
    needsYou: members.filter((m) => m.state === "needs_you" || m.state === "waiting").length,
    blocked: members.filter((m) => m.state === "blocked").length,
    rest: rest.length,
  };

  const drawerTarget: AgentDrawerTarget | null = selected
    ? {
        id: selected.id,
        name: selected.name,
        stateLabel: selected.stateLabel,
        dotState: selected.dotState,
        currentTask: selected.currentTask,
        approvalAction: selected.state === "needs_you" || selected.state === "waiting" ? selected.ask : null,
      }
    : null;

  return (
    <>
      <div className="space-y-4">
        {/* Status strip — the counts, stated plainly */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-2xs uppercase tracking-wide">
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span className="state-dot" data-state={counts.working > 0 ? "working" : ""} />
            {counts.working} working
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span className="state-dot" data-state={counts.needsYou > 0 ? "waiting" : ""} />
            {counts.needsYou} need{counts.needsYou === 1 ? "s" : ""} you
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span className="state-dot" data-state={counts.blocked > 0 ? "blocked" : ""} />
            {counts.blocked} blocked
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="state-dot" />
            {counts.rest} idle
          </span>
          <span className="ml-auto hidden text-muted sm:inline">
            live from each employee&apos;s own rows
          </span>
        </div>

        {/* The departments still hold the middle of the hierarchy, as one row */}
        {departments.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Departments
            </span>
            {departments.map((department) => (
              <Link
                key={department.id}
                href={`/app/departments/${department.id}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-2xs text-ink transition-colors hover:border-hairline-strong hover:bg-surface-secondary"
              >
                <span
                  className="state-dot"
                  data-state={
                    department.needsYou > 0
                      ? "waiting"
                      : department.working > 0
                        ? "working"
                        : ""
                  }
                />
                {department.name}
                <span className="font-mono tabular-nums text-muted">{department.employees}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Attention first: people before work */}
        {attention.length > 0 && (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {attention.map((member) => (
              <AttentionCard key={member.id} member={member} onOpen={setSelected} />
            ))}
          </div>
        )}

        {/* Working now — the primary band */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Working now
            </h3>
            {working.length > 0 && (
              <span className="font-mono text-2xs text-muted">
                {working.length} of {members.length} employees
              </span>
            )}
          </div>
          {working.length === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No one is working this minute.</p>
              <p className="mt-1 text-xs text-muted">
                {rest.length > 0
                  ? `${rest.length} employee${rest.length === 1 ? "" : "s"} are available for the next task.`
                  : "Assign work, or ask Atlas to plan the next move."}
              </p>
            </div>
          ) : (
            // One employee working gets the full width of the column; two or
            // more pair up. The cards are the loudest thing in the section, so
            // they are never squeezed into a three-up strip to fit more in.
            <div className={`mt-2 grid gap-3 ${working.length === 1 ? "" : "sm:grid-cols-2"}`}>
              {working.map((member) => (
                <WorkCard key={member.id} member={member} onOpen={setSelected} />
              ))}
            </div>
          )}
        </div>

        {rest.length > 0 && <RestRail members={rest} onOpen={setSelected} />}

        {attention.length > 0 && (
          <p className="flex items-center gap-1.5 text-2xs text-muted">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Attention items come from open approvals and each employee&apos;s newest event — never inferred.
          </p>
        )}
      </div>

      <AgentDrawer target={drawerTarget} onClose={() => setSelected(null)} />
    </>
  );
}
