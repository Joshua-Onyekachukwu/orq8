"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

const SAMPLE_COMMANDS = [
  "Research the Nigerian renewable energy market",
  "Prepare a competitor analysis for our three biggest competitors",
  "Create a marketing plan for next month",
  "Find what needs my attention today",
  "Draft the weekly executive report",
  "Send a status update to the team",
];

interface CommandInputProps {
  isProcessing: boolean;
  onSubmit: (command: string) => void;
  onSuggestionClick: (command: string) => void;
}

export function CommandInput({ isProcessing, onSubmit, onSuggestionClick }: CommandInputProps) {
  const [command, setCommand] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing) return;
    onSubmit(command.trim());
    setCommand("");
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-all focus-within:border-[#1a5c2e] focus-within:ring-2 focus-within:ring-[#1a5c2e]/10">
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Tell your Executive Agent what to do..."
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            disabled={isProcessing}
          />
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-gray-400 sm:inline">
              <kbd className="rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </span>
            <button
              type="submit"
              disabled={!command.trim() || isProcessing}
              className="flex h-8 items-center gap-2 rounded-lg bg-[#1a5c2e] px-4 text-xs font-medium text-white transition-colors hover:bg-[#144a24] disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  Send
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {!isProcessing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_COMMANDS.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              className="rounded-full border border-gray-100 bg-white px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-[#1a5c2e]/30 hover:text-[#1a5c2e]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
