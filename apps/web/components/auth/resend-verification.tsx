"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

const fieldClass =
  "h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[color:var(--orq-ink-accent)] focus:ring-2 focus:ring-[color:var(--orq-ink-accent)]/25 disabled:opacity-50";

/**
 * Requests a new confirmation email. Two shapes:
 *  - defaultEmail set (the founder is signed in, we know the address): one click.
 *  - no defaultEmail (locked out at sign-in): collects an address first.
 * The request endpoint answers identically for known and unknown addresses, so
 * the success message never confirms whether an account exists.
 */
export function ResendVerification({ defaultEmail }: { defaultEmail?: string | null }) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data as { error?: string } | null)?.error;
        setError(message ?? "The email could not be sent. Try again in a moment.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div aria-live="polite" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-sm text-white">A new confirmation link is on its way.</p>
        <p className="mt-1 text-xs text-white/50">
          If it does not arrive within a few minutes, check your spam folder. The link expires
          after 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-3" aria-busy={pending}>
      {!defaultEmail && (
        <div>
          <label htmlFor="resend-email" className="mb-1.5 block text-sm text-white/70">
            Email address
          </label>
          <input
            id="resend-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className={fieldClass}
            placeholder="you@company.com"
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error-ink"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-white transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending a new link…
          </>
        ) : (
          "Send a new confirmation link"
        )}
      </button>
    </form>
  );
}
