"use client";

import { useState } from "react";

// Landing-page waitlist capture — posts through /api/waitlist (public endpoint).
export function WaitlistForm({ variant = "light", source = "landing" }: { variant?: "light" | "navy"; source?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const navy = variant === "navy";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "Could not sign you up — try again.");
        return;
      }
      setStatus("done");
      setMessage(data?.data?.already ? "You're already on the list — we'll be in touch." : "You're on the list. We'll email you when your cohort opens.");
    } catch {
      setStatus("error");
      setMessage("Network error — the preview API may be down.");
    }
  }

  return (
    <div>
      {status === "done" ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            navy ? "border-white/20 bg-white/10 text-white" : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            aria-label="Email address"
            className={`h-12 w-full rounded-lg border px-4 text-sm outline-none transition-colors ${
              navy
                ? "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-white/50 focus:bg-white/15"
                : "border-hairline bg-white text-ink placeholder:text-muted focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20"
            }`}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className={`h-12 shrink-0 rounded-lg px-6 text-sm font-semibold transition-colors disabled:opacity-50 ${
              navy
                ? "bg-white text-navy-900 hover:bg-white/90"
                : "bg-navy-800 text-white hover:bg-navy-700"
            }`}
          >
            {status === "loading" ? "Joining…" : "Get early access"}
          </button>
        </form>
      )}
      {status === "error" && (
        <p className={`mt-2 text-sm ${navy ? "text-red-200" : "text-red-700"}`}>{message}</p>
      )}
    </div>
  );
}
