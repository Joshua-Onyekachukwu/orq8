"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

const fieldClass =
  "h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3.5 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-orq8-green/60 focus:ring-2 focus:ring-emerald/25 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm font-medium text-white/70";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm_password") ?? "");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          data?.error?.message ?? "Invalid or expired reset link. Please request a new one.";
        setError(message);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orq8-lime/10">
          <CheckCircle2 className="h-7 w-7 text-orq8-green" />
        </div>
        <p className="text-sm font-medium text-white">Password updated</p>
        <p className="mt-1 text-sm text-fog">
          Your password has been reset successfully.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-orq8-green text-sm font-semibold text-white transition-colors hover:bg-orq8-lime"
        >
          Sign in with new password
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="password" className={labelClass}>
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={8}
            disabled={pending}
            className={`${fieldClass} pr-11`}
            placeholder="At least 8 characters"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-orq8-lime"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirm_password" className={labelClass}>
          Confirm password
        </label>
        <div className="relative">
          <input
            id="confirm_password"
            name="confirm_password"
            type={showConfirm ? "text" : "password"}
            required
            autoComplete="new-password"
            minLength={8}
            disabled={pending}
            className={`${fieldClass} pr-11`}
            placeholder="Repeat your password"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            aria-pressed={showConfirm}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-orq8-lime"
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orq8-green text-sm font-semibold text-white transition-colors hover:bg-orq8-lime active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Resetting password…
          </>
        ) : (
          "Reset password"
        )}
      </button>
    </form>
  );
}
