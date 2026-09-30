"use client";

import React, { useEffect, useRef } from "react";
import { CornerDownLeft, Send, Sparkles } from "lucide-react";

import { SUGGESTED_ASKS } from "../lib/simulate";
import { usePrototype } from "../state/store";
import { Button, FOCUS, Initials, ModeChip } from "./ui";

export function EaPanel({
  inputRef,
  onClose,
  onAsk,
  className = "",
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onClose?: () => void;
  /** The board owns the question to answer to board-effect pipeline. */
  onAsk: (text: string) => void;
  className?: string;
}) {
  const { state, counts } = usePrototype();
  const [value, setValue] = React.useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length, state.thinking]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || state.thinking) return;
    onAsk(trimmed);
    setValue("");
  };

  return (
    <div className={`flex h-full min-h-0 flex-col bg-surface-white ${className}`}>
      <div className="bg-brand-deep px-4 py-3 text-on-brand">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-on-brand/12 text-2xs font-bold" aria-hidden>
            EA
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Executive Agent
              <span className="inline-flex items-center gap-1.5 rounded-md bg-on-brand/12 px-1.5 py-0.5 text-3xs font-medium">
                <span className="size-1.5 rounded-full bg-on-ink" aria-hidden />
                Online
              </span>
            </h2>
            <p className="mt-0.5 text-3xs text-on-brand/80">Reads the whole company, asks before it spends</p>
          </div>
          <span className="ml-auto">
            <ModeChip mode="assisted" />
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className={`rounded-md px-2 py-1 text-3xs font-medium text-on-brand/90 hover:bg-on-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] xl:hidden`}
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      {/* Company context: the panel states what it is looking at. */}
      <div className="border-b border-hairline bg-canvas px-4 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">Reading now</p>
        <p className="mt-1 text-2xs text-ink-muted">
          {counts.departments} departments · {counts.agents} AI employees · {counts.activeWork} work items ·{" "}
          <span className="text-warm-ink">{counts.attention} need you</span> ·{" "}
          {state.company.credits.used.toLocaleString()} credits spent
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" role="log" aria-label="Conversation with the Executive Agent">
        <ul className="grid gap-4">
          {state.messages.map((message) =>
            message.from === "ea" ? (
              <li key={message.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-deep text-[10px] font-bold text-on-brand" aria-hidden>
                  EA
                </span>
                <div className="min-w-0">
                  <p className="text-2sm leading-relaxed text-ink">{message.text}</p>
                  {message.effectNote ? (
                    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      board · {message.effectNote}
                    </p>
                  ) : null}
                </div>
              </li>
            ) : (
              <li key={message.id} className="flex items-start justify-end gap-2.5">
                <div className="min-w-0 max-w-[85%] rounded-lg rounded-tr-sm bg-surface-secondary px-3 py-2">
                  <p className="text-2sm leading-relaxed text-ink">{message.text}</p>
                </div>
                <Initials name={state.company.founderName} className="mt-0.5" />
              </li>
            ),
          )}
          {state.thinking ? (
            <li className="flex items-center gap-2.5" aria-live="polite">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-deep text-[10px] font-bold text-on-brand" aria-hidden>
                EA
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-ink-muted">
                <Sparkles className="h-3.5 w-3.5 motion-safe:animate-pulse" aria-hidden />
                Reading the board
              </span>
            </li>
          ) : null}
        </ul>
        <div ref={endRef} />
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">Try asking</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED_ASKS.slice(0, 4).map((ask) => (
            <button
              key={ask}
              type="button"
              onClick={() => send(ask)}
              className={`rounded-lg border border-hairline px-2 py-1.5 text-2xs text-ink-muted transition-colors hover:bg-surface-secondary hover:text-ink ${FOCUS}`}
            >
              {ask}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(value);
          }}
        >
          <label htmlFor="ea-input" className="sr-only">
            Ask your company
          </label>
          <input
            id="ea-input"
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask your company..."
            className={`min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-white px-3 py-2 text-2sm text-ink placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] focus-visible:ring-offset-1 outline-none`}
          />
          <Button variant="primary" type="submit" disabled={state.thinking || value.trim().length === 0} className="disabled:opacity-50">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Send
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-faint">
          <CornerDownLeft className="h-3 w-3" aria-hidden />
          Answers are simulated from the prototype board. No model is called.
        </p>

        {state.simLog.length > 0 ? (
          <details className="mt-3 border-t border-hairline pt-2">
            <summary className="cursor-pointer text-2xs font-medium text-ink-muted">
              Simulated actions ({state.simLog.length})
            </summary>
            <ul className="mt-2 grid gap-1">
              {state.simLog.slice(0, 6).map((entry, index) => (
                <li key={`${entry}-${index}`} className="font-mono text-[10px] text-ink-faint">
                  {entry}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
