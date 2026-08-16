"use client";

import { useState } from "react";

// Landing-page waitlist capture. Posts through /api/waitlist (public endpoint).
// `variant="partner"` is the design-partner path (marketing/design_partner_application.md):
// adds name + team size + note, tagged source=design_partner so the cohort pipeline
// can pull candidates straight out of waitlist_signups.
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

  const navy = variant === "navy";
  const partner = variant === "partner";
  const dark = variant === "dark";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: partner && name.trim() ? name.trim() : undefined,
          role: partner && role ? role : undefined,
          source: partner ? "design_partner" : source,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "Could not sign you up. Try again.");
        return;
      }
      setStatus("done");
      setMessage(
        data?.data?.already
          ? "You're already on the list. We'll be in touch."
          : partner
            ? "Application received. We read every one. We'll email you within a few days."
            : "You're on the list. We'll email you when your cohort opens.",
      );
    } catch {
      setStatus("error");
      setMessage("Network error. The preview API may be down.");
    }
  }

  const field =
    navy || partner || dark
      ? "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-white/50 focus:bg-white/15"
      : "border-hairline bg-white text-ink placeholder:text-muted focus:border-navy-700 focus:ring-2 focus:ring-navy-700/20";

  const btn =
    dark
      ? "bg-emerald text-navy-950 hover:bg-emerald-300"
      : navy || partner
        ? "bg-white text-navy-900 hover:bg-white/90"
        : "bg-navy-800 text-white hover:bg-navy-700";

  return (
    <div className="w-full text-left">
      {status === "done" ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            navy || partner || dark
              ? "border-white/20 bg-white/10 text-white"
              : "border-green-300 bg-green-50 text-green-800"
          }`}
        >
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {partner && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                name="name"
                spellCheck={false}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                aria-label="Full name"
                autoComplete="name"
                className={`h-11 w-full rounded-lg border px-4 text-sm outline-none transition-colors ${field}`}
              />
              <select
                required
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                aria-label="How you run the business"
                className={`h-11 w-full rounded-lg border px-4 text-sm outline-none transition-colors ${
                  navy || partner ? "bg-navy-900 text-white" : "bg-white text-ink"
                } ${field} ${role === "" ? (navy || partner ? "text-white/40" : "text-muted") : ""}`}
              >
                <option value="" disabled className="text-ink">
                  You run it…
                </option>
                <option value="just_me" className="text-ink">Just me</option>
                <option value="me_1_2" className="text-ink">Me + 1–2</option>
                <option value="small_team" className="text-ink">Small team</option>
              </select>
            </div>
          )}

          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={partner ? "you@company.com" : "you@company.com"}
              aria-label="Email address"
              className={`h-11 w-full rounded-lg border px-4 text-sm outline-none transition-colors ${field}`}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className={`h-11 shrink-0 rounded-lg px-6 text-sm font-semibold transition-colors disabled:opacity-50 ${btn}`}
            >
              {status === "loading"
                ? "Submitting…"
                : partner
                  ? "Apply as a design partner"
                  : "Get early access"}
            </button>
          </div>

          {partner && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="One real decision you'd feed ORQ8 in your first two weeks (optional: e.g. “should we build X?”)"
              aria-label="The decision you'd feed ORQ8"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none transition-colors ${field}`}
            />
          )}
        </form>
      )}
      {status === "error" && (
        <p className={`mt-2 text-sm ${navy || partner || dark ? "text-red-200" : "text-red-700"}`}>{message}</p>
      )}
    </div>
  );
}
