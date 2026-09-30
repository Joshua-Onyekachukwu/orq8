"use client";

import React from "react";
import Link from "next/link";
import { Info, Plus, Plug, ListChecks, MessagesSquare, UserPlus, Workflow } from "lucide-react";

import { LogoMark } from "../../branding/logo-mark";
import { usePrototype } from "../state/store";
import { Eyebrow, Figure, StatusChip, Button } from "./ui";

export type BoardActions = {
  askEa: (text: string) => void;
  openHire: (departmentId: string) => void;
  openAddDepartment: () => void;
  openCreateWork: (departmentId: string) => void;
  openConnectTool: () => void;
  openSimulationNotes: () => void;
  openApprovals: () => void;
};

/** The honesty banner: this is a design exercise, and nothing here is real. */
export function PrototypeBanner({ onOpenNotes }: { onOpenNotes: () => void }) {
  return (
    <div className="ink flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-2xs sm:px-6">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-accent">
        Prototype
      </span>
      <p className="text-on-ink">
        A design exercise for a new company operating view. NovaForge AI is invented, and every number on this page is
        simulated.
      </p>
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenNotes}
          className="inline-flex items-center gap-1.5 text-2xs font-medium text-on-ink underline decoration-on-ink-muted underline-offset-2 hover:decoration-on-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)]"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          What is simulated
        </button>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 rounded-md bg-on-brand/12 px-2.5 py-1 text-2xs font-medium text-on-ink transition-colors hover:bg-on-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)]"
        >
          Open the current dashboard
        </Link>
      </div>
    </div>
  );
}

export function CompanyHeader({ actions, onOpenEa }: { actions: BoardActions; onOpenEa: () => void }) {
  const { state, counts } = usePrototype();

  return (
    <header className="border-b border-hairline bg-canvas px-4 pb-4 pt-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-ink">
            <LogoMark className="h-6 w-auto" ariaLabel="ORQ8" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{state.company.name}</h1>
            <p className="mt-0.5 text-2sm text-ink-muted">
              {state.company.mission}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
              {state.company.plan} · founded {state.company.foundedAt} · {state.company.stage}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={actions.openApprovals}>
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            Review approvals
            <span className="ml-1 rounded-md bg-on-brand/20 px-1.5 text-2xs tabular-nums">{counts.attention}</span>
          </Button>
          <Button onClick={() => actions.openHire("engineering")}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Hire AI employee
          </Button>
          <Button onClick={actions.openAddDepartment}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add department
          </Button>
          <Button onClick={() => actions.openCreateWork("product")}>
            <Workflow className="h-3.5 w-3.5" aria-hidden />
            Create work
          </Button>
          <Button onClick={actions.openConnectTool}>
            <Plug className="h-3.5 w-3.5" aria-hidden />
            Connect tool
          </Button>
          {/* Matches the drawer breakpoint: between lg and xl the panel is not in
              the layout, so the only way in is this button. */}
          <span className="xl:hidden">
            <Button onClick={onOpenEa}>
              <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
              Executive Agent
            </Button>
          </span>
        </div>
      </div>
    </header>
  );
}

export function CompanyState() {
  const { state, counts } = usePrototype();
  return (
    <section aria-labelledby="company-state-heading" className="border-b border-hairline bg-surface-white px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Eyebrow as="h2" className="sr-only">
          Company state
        </Eyebrow>
        <span id="company-state-heading" className="inline-flex items-center gap-2">
          <StatusChip status="active" />
          <span className="text-2sm font-medium text-ink">Company operating</span>
        </span>
        <p className="text-2xs text-ink-muted">
          {counts.activeWork} work items in flight, {counts.attention} waiting on you, {counts.blocked} blocked.
        </p>
      </div>
      {/*
       * Reflows instead of scrolling: eight columns on desktop as a divided
       * row, four on tablet, two on a phone. An overflowing strip cut the last
       * figure in half, which read as a broken layout rather than a hint.
       */}
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:grid-cols-8 xl:gap-x-0 xl:divide-x xl:divide-hairline">
        <Figure label="Departments" value={counts.departments} />
        <Figure label="AI employees" value={counts.agents} hint={`${counts.working} working or available`} />
        <Figure label="Active work" value={counts.activeWork} />
        <Figure label="Awaiting you" value={counts.attention} tone="attention" hint="Approvals and decisions" />
        <Figure label="Blocked" value={counts.blocked} tone={counts.blocked > 0 ? "error" : "default"} />
        <Figure label="In review" value={counts.review} />
        <Figure label="Completed today" value={counts.completedToday} />
        <Figure
          label="Credits spent"
          value={`${state.company.credits.used.toLocaleString()}`}
          hint={`of ${state.company.credits.allowance.toLocaleString()} this month`}
        />
      </div>
    </section>
  );
}
