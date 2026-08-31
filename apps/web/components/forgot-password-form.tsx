"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

const fieldClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-navy-950 placeholder:text-gray-400 outline-none transition-colors focus:border-emerald focus:ring-2 focus:ring-emerald/25 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-600";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");

    setPending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // Always show success to prevent email enumeration
      setSent(true);
    } catch {
      // Even on network error, show success to prevent information leakage
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald/10">
          <CheckCircle2 className="h-7 w-7 text-emerald" />
        </div>
        <p className="text-sm font-medium text-navy-950">Check your email</p>
        <p className="mt-1 text-sm text-gray-500">
          If an account exists with that email, we&apos;ve sent a password
          reset link.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Didn&apos;t receive it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
            className="font-medium text-emerald transition-colors hover:text-emerald/80"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {error}
        </div>
      )}

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
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy-950 text-sm font-semibold text-white transition-colors hover:bg-navy-950/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending reset link…
          </>
        ) : (
          "Send reset link"
        )}
      </button>
    </form>
  );
}
