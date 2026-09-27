"use client";

/**
 * ExecutiveAgentRail — the persistent 25% Executive Agent surface of the
 * Company Hub.
 *
 * This is the interaction interface, not a second EA: it shows the same
 * agent's live company state, follows whatever the founder has selected in the
 * hub, and hands the founder's instruction to the real EA conversation
 * (the panel, which streams through the real backend).
 */

import { useState } from "react";
import { Send } from "lucide-react";
import { useExecutiveAgent } from "../executive-agent-context";
import { ago, Empty } from "./hub-ui";

export interface CoordinationItem {
  id: number;
  summary: string;
  type: string;
  agentName: string | null;
  occurredAt: string;
}

export function ExecutiveAgentRail({
  eaName,
  companyName,
  working,
  waiting,
  blocked,
  attentionCount,
  creditsRemaining,
  creditsUsed,
  coordination,
}: {
  eaName: string;
  companyName: string;
  working: number;
  waiting: number;
  blocked: number;
  attentionCount: number;
  creditsRemaining: number;
  creditsUsed: number;
  coordination: CoordinationItem[];
}) {
  const { openPanel, pageContext } = useExecutiveAgent();
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    openPanel(text);
  };

  const suggestions = [
    "What needs my attention?",
    "What is blocked right now?",
    "What did the company complete today?",
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-white">
      <div className="border-b border-hairline p-4">
        <p className="font-mono text-3xs uppercase tracking-[0.2em] text-muted">Executive Agent</p>
        <p className="mt-1 text-sm font-semibold text-ink">{eaName}</p>
        <p className="mt-1 text-2xs text-muted">
          {blocked > 0
            ? `${blocked} blocked item${blocked === 1 ? "" : "s"} · ${attentionCount} need you`
            : `Company operating · ${attentionCount} need you`}
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-canvas p-2">
            <dt className="text-3xs uppercase tracking-wide text-muted">Working</dt>
            <dd className="text-sm font-semibold tabular-nums text-orq8-green">{working}</dd>
          </div>
          <div className="rounded-lg bg-canvas p-2">
            <dt className="text-3xs uppercase tracking-wide text-muted">Waiting</dt>
            <dd className="text-sm font-semibold tabular-nums text-orq8-orange">{waiting}</dd>
          </div>
          <div className="rounded-lg bg-canvas p-2">
            <dt className="text-3xs uppercase tracking-wide text-muted">Credits</dt>
            <dd className="text-sm font-semibold tabular-nums text-ink">{creditsRemaining}</dd>
          </div>
        </dl>
        <p className="mt-2 text-3xs text-muted">
          {creditsUsed} credits used this period in {companyName}
        </p>
      </div>

      {pageContext?.entity ? (
        <div className="border-b border-hairline bg-canvas px-4 py-2 text-2xs text-muted">
          Following: <span className="text-ink">{pageContext.entity.name ?? pageContext.entity.type}</span>
          {pageContext.entity.status ? ` · ${pageContext.entity.status}` : ""}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted">Coordination</p>
        {coordination.length === 0 ? (
          <div className="mt-2">
            <Empty>No company activity recorded yet. {eaName} will report work here as it happens.</Empty>
          </div>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {coordination.map((item) => (
              <li key={item.id} className="text-2sm">
                <p className="text-ink">{item.summary}</p>
                <p className="text-3xs text-muted">
                  {item.agentName ? `${item.agentName} · ` : ""}
                  {ago(item.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-hairline p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => openPanel(s)}
              className="rounded-full border border-hairline px-2.5 py-1 text-3xs text-muted transition-colors hover:border-orq8-orange/40 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={`Ask ${eaName}...`}
            className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-hairline px-3 py-2 text-2sm text-ink outline-none focus:border-orq8-orange/50"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orq8-orange px-3 py-2 text-2xs font-semibold text-white transition-colors hover:bg-orq8-orange-bright disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </div>
        <p className="mt-2 text-3xs text-muted">
          Opens {eaName} with your instruction. Every reply comes from the real Executive Agent.
        </p>
      </div>
    </div>
  );
}
