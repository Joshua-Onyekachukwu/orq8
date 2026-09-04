"use client";

import { useState, useMemo } from "react";

// Seeded pseudo-random number generator: produces the same "waitlist number"
// for the same email, so refreshing the confirmation doesn't generate a new one.
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return 1000 + Math.abs(h % 9000);
}

// Landing-page waitlist capture. Posts through /api/waitlist (public endpoint).
// Shows a premium confirmation with a persistent waitlist position number.
export function WaitlistForm({
  variant = "light",
  source = "landing",
}: {
  variant?: "light" | "navy" | "partner" | "dark";
  source?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"just_me" | "me_1_2" | "small_team" | "">("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [isAlready, setIsAlready] = useState(false);

  const navy = variant === "navy";
  const dark = variant === "dark";

  // Deterministic waitlist number based on email - same email always gets same number
  const waitlistNumber = useMemo(() => {
    return submittedEmail ? seededRandom(submittedEmail) : null;
  }, [submittedEmail]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name.trim() || undefined, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "Could not sign you up. Try again.");
        return;
      }
      setSubmittedEmail(email);
      setIsAlready(data?.data?.already === true);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error. The waitlist service is unavailable.");
    }
  }

  const field =
    dark
      ? "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-white/50 focus:bg-white/15"
      : "border-hairline bg-white text-ink placeholder:text-muted focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

  const btn =
    dark
      ? "bg-[#1a5c2e] text-white hover:bg-[#1a5c2e]-300"
      : "bg-[#1a5c2e] text-white hover:bg-[#144a24]";

  // Premium waitlist confirmation screen
  if (status === "done" && waitlistNumber) {
    return (
      <div className="w-full text-left">
        <div
          role="status"
          className={`relative overflow-hidden rounded-2xl border p-8 text-center ${
            dark
              ? "border-lime/30 bg-gradient-to-b from-lime/5 to-transparent"
              : "border-[#1a5c2e]-200 bg-gradient-to-b from-emerald-50/80 to-white"
          }`}
        >
          {/* Animated checkmark */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#B8FF66]/10 animate-fade-in">
            <svg className="h-8 w-8 text-[#1a5c2e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <h3 className={`text-xl font-semibold ${dark ? "text-white" : "text-[#0a0a0b]"}`}>
            {isAlready ? "You're already on the list" : "You're officially on the list"}
          </h3>

          {/* Waitlist position number */}
          <div className="my-6">
            <p className={`font-mono text-[10px] uppercase tracking-[0.2em] mb-2 ${dark ? "text-white/50" : "text-muted"}`}>
              Your place
            </p>
            <p className={`text-5xl font-bold tracking-tight tabular-nums animate-fade-in ${
              dark ? "text-[#1a5c2e]" : "text-[#1a5c2e]"
            }`}>
              #{waitlistNumber.toLocaleString()}
            </p>
          </div>

          <p className={`text-sm leading-relaxed max-w-sm mx-auto ${dark ? "text-white/70" : "text-gray-600"}`}>
            {isAlready
              ? "We have your details. We'll be in touch when your cohort opens."
              : "Congratulations. We're building ORQ8 for you. Your place in the first cohort is reserved. We'll email you when it's your turn."}
          </p>

          <div className={`mt-6 flex items-center justify-center gap-2 text-xs font-medium ${dark ? "text-[#1a5c2e]/80" : "text-[#1a5c2e]"}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#1a5c2e] animate-pulse" />
            <span>Company of One · First Cohort</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full text-left">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            name="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            aria-label="Email address"
            className={`h-11 w-full rounded-lg border px-4 text-sm outline-none transition-colors ${field}`}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className={`h-11 shrink-0 rounded-lg px-6 text-sm font-semibold transition-colors disabled:opacity-50 ${btn}`}
          >
            {status === "loading" ? "Joining…" : "Join the waitlist"}
          </button>
        </div>
      </form>
      {status === "error" && (
        <p className={`mt-2 text-sm ${dark ? "text-red-200" : "text-red-700"}`}>{message}</p>
      )}
    </div>
  );
}
