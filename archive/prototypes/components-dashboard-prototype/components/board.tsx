"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";

import { respondTo } from "../lib/simulate";
import { usePrototype } from "../state/store";
import { ActiveWork } from "./active-work";
import { AttentionQueue } from "./attention-queue";
import { CompanyHeader, CompanyState, PrototypeBanner, type BoardActions } from "./company-header";
import { DetailPanel } from "./detail-panel";
import { QuickActionDialog, type DialogState } from "./dialogs";
import { EaPanel } from "./ea-panel";
import { OrganizationMap } from "./organization-map";
import { SupportingSections } from "./supporting-sections";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Board() {
  const { state, dispatch, board } = usePrototype();
  const [dialog, setDialog] = useState<DialogState>(null);
  const eaInputRef = useRef<HTMLInputElement | null>(null);

  /** The one place a founder question becomes an answer plus a board effect. */
  const askEa = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      dispatch({ type: "ask", text: trimmed });
      const reply = respondTo(trimmed, board);
      window.setTimeout(() => dispatch({ type: "reply", reply }), prefersReducedMotion() ? 0 : 600);
    },
    [board, dispatch],
  );

  const focusEa = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches) {
      eaInputRef.current?.focus();
      return;
    }
    dispatch({ type: "toggle-ea", open: true });
  }, [dispatch]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const actions: BoardActions = {
    askEa,
    openHire: (departmentId) => setDialog({ kind: "hire", departmentId }),
    openAddDepartment: () => setDialog({ kind: "department" }),
    openCreateWork: (departmentId) => setDialog({ kind: "work", departmentId }),
    openConnectTool: () => setDialog({ kind: "tool" }),
    openSimulationNotes: () => setDialog({ kind: "notes" }),
    openApprovals: () => scrollTo("attention-heading"),
  };

  // Escape steps back: dialog, then drawer, then selection.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dialog) return;
      if (state.eaOpen) {
        dispatch({ type: "toggle-ea", open: false });
        return;
      }
      if (state.selection) dispatch({ type: "clear-selection" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, dispatch, state.eaOpen, state.selection]);

  const latest = state.activity[0];
  const justHappened = latest && latest.at === "Just now" ? latest : null;

  return (
    <div id="main" className="min-h-screen bg-canvas">
      <PrototypeBanner onOpenNotes={actions.openSimulationNotes} />

      <div className="mx-auto max-w-[1600px]">
        <CompanyHeader actions={actions} onOpenEa={focusEa} />

        <div className="xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]">
          {/* 3/4: the company operating hub */}
          <div className="min-w-0 border-hairline xl:border-r">
            <CompanyState />

            {justHappened ? (
              <div className="flex items-center gap-2 border-b border-hairline bg-brand-tint px-4 py-2 text-2xs text-ink sm:px-6">
                <Radio className="h-3.5 w-3.5 shrink-0 text-brand-ink" aria-hidden />
                <p>
                  <span className="font-semibold">{justHappened.actor}</span> {justHappened.text}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                    simulated, just now
                  </span>
                </p>
              </div>
            ) : null}

            <DetailPanel
              onAsk={askEa}
              onHireInto={(departmentId) => setDialog({ kind: "hire", departmentId })}
              onCreateWork={(departmentId) => setDialog({ kind: "work", departmentId })}
            />

            <OrganizationMap
              onHireInto={(departmentId) => setDialog({ kind: "hire", departmentId })}
              onFocusEa={focusEa}
            />

            <AttentionQueue onReview={(id) => dispatch({ type: "select", selection: { kind: "attention", id } })} />

            <ActiveWork />

            <SupportingSections />

            <footer className="border-t border-hairline px-4 py-6 text-2xs text-ink-muted sm:px-6">
              <p>
                Prototype for review. The current dashboard is untouched and still runs on{" "}
                <a href="/app" className="underline decoration-hairline-strong underline-offset-2 hover:text-ink">
                  /app
                </a>
                . Data on this page is invented and lives only in the browser.
              </p>
            </footer>
          </div>

          {/* 1/4: the Executive Agent, persistent on desktop */}
          <aside className="hidden xl:block" aria-label="Executive Agent">
            <div className="sticky top-0 h-screen">
              <EaPanel inputRef={eaInputRef} onAsk={askEa} />
            </div>
          </aside>
        </div>
      </div>

      {/* Tablet and mobile: the same panel as a drawer */}
      {state.eaOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            aria-label="Close the Executive Agent panel"
            onClick={() => dispatch({ type: "toggle-ea", open: false })}
            className="absolute inset-0 cursor-default bg-ink/40"
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-md border-l border-hairline bg-surface-white shadow-xl">
            <EaPanel
              inputRef={eaInputRef}
              onAsk={askEa}
              onClose={() => dispatch({ type: "toggle-ea", open: false })}
            />
          </div>
        </div>
      ) : null}

      <QuickActionDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
