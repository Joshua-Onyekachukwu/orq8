"use client";

/**
 * EADock — the fixed Executive Agent surface on the company HQ (docs/71 §F,
 * marketing/headquarters-mock-v2.html "EA dock").
 *
 * The dock is one of two views of the SAME thread held in
 * ExecutiveAgentProvider: a message sent here is visible from the slide-in
 * panel on any other page (the floating launcher's door), and the launcher is
 * hidden on this route because the dock owns the EA surface here.
 *
 * On phones the column would sit below the fold, so the same dock body also
 * lives behind a fixed bottom bar (one tap → bottom sheet) — Atlas stays one
 * tap away at every width, and it is still the same shared thread.
 *
 * Everything shown is real: pending gates come from the approvals queue and
 * decide for real, event cards come from the activity feed, the plan card
 * from the strategy page's unratified revision, and messages go through the
 * streaming command pipeline — no invented content.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronUp, Loader2, X } from "lucide-react";

import { useExecutiveAgent, useEaName } from "../executive-agent-context";

export interface EADockApproval {
  id: string;
  agentName: string | null;
  action: string;
  description: string | null;
  cost: number;
}

export interface EADockEvent {
  id: number;
  type: string;
  summary: string;
  agentName: string | null;
  cost: number;
}

export interface EADockProps {
  /** The EA's opening line for an empty thread (server-computed live summary). */
  intro: string;
  approvals: EADockApproval[];
  /** Newest-first slice of the activity feed, for the "while you were away" cards. */
  events: EADockEvent[];
  /** The employee mid-task right now, for the now-strip. */
  workingNow: { name: string; task: string } | null;
  /** The unratified plan revision awaiting the founder, if any. */
  pendingRevision: { rev: number; authorName: string; summary: string | null } | null;
  eventsThisHour: number;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The dock's shared body — identical content in the desktop aside and the mobile sheet. */
function DockBody({
  variant,
  onClose,
  intro,
  approvals,
  events,
  workingNow,
  pendingRevision,
  eventsThisHour,
}: EADockProps & { variant: "dock" | "sheet"; onClose?: () => void }) {
  const { messages, sendMessage, loading, stages, error, openPanel } =
    useExecutiveAgent();
  const EA_NAME = useEaName();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const cardsRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    cardsRef.current?.scrollTo({ top: cardsRef.current.scrollHeight });
  }, [messages.length, loading]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    void sendMessage(text);
  }, [input, loading, sendMessage]);

  const decide = useCallback(
    async (approvalId: string, status: "approved" | "rejected") => {
      if (deciding) return;
      setDeciding(approvalId);
      try {
        const res = await fetch(`/api/approvals/${approvalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (res.ok) {
          setDecided((prev) => new Set(prev).add(approvalId));
          // The banner, stats and org tree all read from these rows.
          router.refresh();
        }
      } catch {
        // Founder can retry from the Approvals page.
      } finally {
        setDeciding(null);
      }
    },
    [deciding, router],
  );

  const openGates = approvals.filter((a) => !decided.has(a.id));

  return (
    <aside
      aria-label={`${EA_NAME} — Executive Agent dock`}
      className={
        variant === "dock"
          ? "hidden flex-col overflow-hidden rounded-lg border border-hairline bg-elevated lg:sticky lg:top-[4.5rem] lg:flex lg:h-[calc(100vh-4.5rem)] lg:min-h-[720px]"
          : "flex h-full w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-hairline bg-elevated"
      }
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-hairline px-3.5 py-3">
        <span
          aria-hidden="true"
          className="ea-avatar flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-mark-active/40 text-xs text-brand-ink"
          style={{ backgroundColor: "rgba(166,206,149,0.08)" }}
        >
          ◈
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{EA_NAME}</p>
          <p className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="state-dot" data-state={workingNow ? "working" : ""} />
            Executive Agent · {workingNow ? "directing work" : "active"}
          </p>
        </div>
        {variant === "sheet" ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${EA_NAME}`}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline text-muted transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openPanel()}
            className="ml-auto shrink-0 rounded-md border border-hairline px-2.5 py-1 text-2xs text-muted transition-colors hover:text-ink"
          >
            Expand
          </button>
        )}
      </div>

      {/* Now strip — the employee mid-task, exactly the mock's live line */}
      {workingNow && (
        <div
          className="flex items-center gap-2 border-b border-hairline px-3.5 py-2 text-xs text-ink"
          style={{ backgroundColor: "rgba(166,206,149,0.06)" }}
        >
          <span className="state-dot" data-state="working" />
          <span className="min-w-0 flex-1 truncate">
            <b className="font-semibold">{workingNow.name}</b> — {workingNow.task}
          </span>
          <Link href="/app/tasks" className="shrink-0 text-2xs text-muted hover:text-ink">
            Open tasks
          </Link>
        </div>
      )}

      {/* Thread + event cards */}
      <div ref={cardsRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink">
            {intro}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[86%] rounded-xl rounded-br-sm border border-hairline-strong bg-canvas px-3.5 py-2 text-sm leading-relaxed text-ink">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink">
              {m.content}
            </div>
          ),
        )}

        {loading && (
          <div className="rounded-xl border border-hairline bg-canvas px-3.5 py-2.5">
            {/* Single quiet indicator while working. The stage-by-stage
                narration ("reading the organization", "analyzing command"…)
                was noise: the founder asked for execute-and-report, not a
                progress play-by-play. Stages stay in the stream for logs. */}
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {EA_NAME} is working…
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-border-error bg-error-soft px-3 py-2 text-2xs text-error-ink">
            {error}
          </p>
        )}

        {/* Gates — decide right here, exactly the mock's gate cards */}
        {openGates.map((gate) => (
          <div
            key={gate.id}
            className="rounded-lg border border-hairline border-l-2 border-l-warm bg-canvas p-3"
          >
            <p className="text-2xs text-muted">
              Gate · {gate.agentName ?? "An employee"}
              {gate.cost > 0 ? ` · ${formatMoney(gate.cost)}` : ""}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">{gate.action}</p>
            {gate.description && (
              <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-muted">
                {gate.description}
              </p>
            )}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={deciding === gate.id}
                onClick={() => decide(gate.id, "rejected")}
                className="btn-ghost-danger flex-1 justify-center rounded-md border border-hairline px-2 py-1.5 text-xs text-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={deciding === gate.id}
                onClick={() => decide(gate.id, "approved")}
                className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
              >
                {deciding === gate.id ? "Deciding…" : "Approve"}
              </button>
            </div>
          </div>
        ))}

        {/* Plan proposal card */}
        {pendingRevision && (
          <div className="rounded-lg border border-hairline bg-canvas p-3">
            <p className="text-sm font-semibold text-ink">
              Plan rev {pendingRevision.rev} drafted
            </p>
            {pendingRevision.summary && (
              <p className="mt-1 text-2xs leading-relaxed text-muted">
                {pendingRevision.summary} — by {pendingRevision.authorName}. Ratify to make it
                direction.
              </p>
            )}
            <Link
              href="/app/strategy"
              className="mt-2 inline-block text-xs text-brand-ink transition-colors hover:text-ink"
            >
              Review &amp; ratify →
            </Link>
          </div>
        )}

        {/* Fresh completed work */}
        {events.slice(0, 2).map((event) => (
          <div key={event.id} className="rounded-lg border border-hairline bg-canvas p-3">
            <p className="text-2xs text-muted">
              {event.agentName ? `${event.agentName} · ` : ""}
              {formatMoney(event.cost)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink">{event.summary}</p>
          </div>
        ))}
      </div>

      {/* Footer line — the mock's dfoot */}
      <p className="border-t border-hairline px-3.5 py-1.5 text-center text-2xs text-muted">
        {eventsThisHour} events this hour
        {openGates.length === 0 ? " · nothing else needs you" : ` · ${openGates.length} gate${openGates.length !== 1 ? "s" : ""} open`}
      </p>

      {/* Composer */}
      <div className="border-t border-hairline px-3 py-2.5">
        <div className="rounded-md border border-hairline bg-canvas px-2.5 py-2 focus-within:border-hairline-strong">
          <textarea
            rows={5}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Message ${EA_NAME} — give direction, ask anything`}
            aria-label={`Message ${EA_NAME}`}
            className="min-h-[5.5rem] w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-muted/70"
          />
          <div className="mt-1 flex items-center gap-1.5">
            {["/hire ", "/budget ", "/pause "].map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => setInput(cmd)}
                className="rounded-full border border-hairline px-2 py-0.5 text-2xs text-muted transition-colors hover:text-ink"
              >
                {cmd.trim()}
              </button>
            ))}
            <button
              type="button"
              onClick={submit}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-40"
              style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** The fixed bottom bar + sheet that carry the dock on phones (<lg). */
function EAMobileDock(props: EADockProps) {
  const EA_NAME = useEaName();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock page scroll behind the sheet, and close on Escape.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* One-tap Atlas bar — the mock's dock, collapsed to a thumb-reachable line */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${EA_NAME}, Executive Agent`}
        className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2.5 rounded-xl border border-hairline bg-elevated/95 px-3.5 py-2.5 text-left shadow-lg backdrop-blur lg:hidden"
      >
        <span
          aria-hidden="true"
          className="ea-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-mark-active/40 text-sm text-brand-ink"
          style={{ backgroundColor: "rgba(166,206,149,0.08)" }}
        >
          ◈
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">
            {EA_NAME}
            {props.approvals.length > 0 && (
              <span
                className="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-semibold"
                style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
              >
                {props.approvals.length} gate{props.approvals.length !== 1 ? "s" : ""}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-2xs text-muted">
            <span className="state-dot" data-state={props.workingNow ? "working" : ""} />
            <span className="truncate">
              {props.workingNow
                ? `${props.workingNow.name} — ${props.workingNow.task}`
                : "Executive Agent · active"}
            </span>
          </span>
        </span>
        <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {/* The sheet — portaled to <body> so no page wrapper can clip it */}
      {mounted &&
        open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${EA_NAME} — Executive Agent`}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/55"
              tabIndex={-1}
            />
            <div className="absolute inset-x-0 bottom-0 top-[6dvh]">
              <DockBody variant="sheet" onClose={() => setOpen(false)} {...props} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function EADock(props: EADockProps) {
  return (
    <>
      <DockBody variant="dock" {...props} />
      <EAMobileDock {...props} />
    </>
  );
}
