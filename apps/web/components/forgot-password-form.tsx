"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const fieldClass =
  "h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#E86A33] focus:ring-2 focus:ring-[#E86A33]/25 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm text-white/70";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");

    setPending(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // The request endpoint never reveals whether an account exists, so the
      // confirmation below is the same on every outcome.
    } finally {
      setPending(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div aria-live="polite" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orq8-green-tint" aria-hidden />
          <div>
            <p className="text-sm text-white">Check your email</p>
            <p className="mt-1 text-xs text-white/60">
              If an account exists for that address, a reset link is on the way. The link expires
              in one hour. Check your spam folder if it does not arrive within a few minutes.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-3 text-xs text-white/50 transition-colors hover:text-white"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          className={fieldClass}
          placeholder="you@company.com"
          autoFocus
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orq8-orange-bright text-sm font-semibold text-orq8-dark transition-colors hover:bg-orq8-orange-bright disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending the reset link…
          </>
        ) : (
          "Send the reset link"
        )}
      </button>
    </form>
  );
}
