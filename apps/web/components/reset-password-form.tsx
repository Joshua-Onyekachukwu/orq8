"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { scorePassword, type StrengthLabel } from "@/lib/password-strength";

const fieldClass =
  "h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[color:var(--orq-ink-accent)] focus:ring-2 focus:ring-[color:var(--orq-ink-accent)]/25 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm text-white/70";

const meterColors: Record<StrengthLabel, string> = {
  weak: "bg-error",
  fair: "bg-warm",
  good: "bg-[color:var(--orq-brand)]",
  strong: "bg-[color:var(--orq-ink-accent)]",
};

function PasswordInput({
  id,
  name,
  label,
  show,
  onToggle,
  onChange,
  disabled,
  placeholder,
  autoFocus,
}: {
  id: string;
  name: string;
  label: string;
  show: boolean;
  onToggle: () => void;
  onChange?: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    const cursorPos = input?.selectionStart ?? 0;
    onToggle();
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(cursorPos, cursorPos);
        } catch {
          // some input types do not support selection ranges
        }
      }
    });
  };

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          autoComplete="new-password"
          minLength={8}
          disabled={disabled}
          className={`${fieldClass} pr-11`}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <button
          type="button"
          onClick={handleToggle}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [helpResend, setHelpResend] = useState(false);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const strength = scorePassword(password);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setHelpResend(false);

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm_password") ?? "");

    if (password !== confirm) {
      setError("The passwords do not match. Re-enter them.");
      return;
    }

    if (password.length < 8) {
      setError("Use at least 8 characters for the new password.");
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
          (data as { error?: { message?: string } } | null)?.error?.message ??
          "This reset link is not valid any more. Request a new one and try again.";
        setError(message);
        setHelpResend(true);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div aria-live="polite" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
          <div>
            <p className="text-sm text-white">Password updated</p>
            <p className="mt-1 text-xs text-white/60">
              Every other session has been signed out. Sign in with the new password.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error-ink"
        >
          <p>{error}</p>
          {helpResend && (
            <Link
              href="/forgot-password"
              className="mt-2 inline-block text-xs text-error-ink underline decoration-error-ink/40 underline-offset-2 transition-colors hover:decoration-error-ink"
            >
              Request a new reset link
            </Link>
          )}
        </div>
      )}

      <PasswordInput
        id="password"
        name="password"
        label="New password"
        placeholder="At least 8 characters"
        show={showPassword}
        onToggle={() => setShowPassword((v) => !v)}
        onChange={setPassword}
        disabled={pending}
        autoFocus
      />

      <div aria-live="polite">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((seg) => (
              <span
                key={seg}
                aria-hidden
                className={`h-1 flex-1 rounded-full transition-colors ${
                  strength.score > seg ? meterColors[strength.label] : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-white/50">{strength.label}</span>
        </div>
        {strength.suggestions.length > 0 && (
          <p className="mt-1 text-xs text-white/50">{strength.suggestions[0]}</p>
        )}
      </div>

      <PasswordInput
        id="confirm_password"
        name="confirm_password"
        label="Confirm password"
        placeholder="Repeat the new password"
        show={showConfirm}
        onToggle={() => setShowConfirm((v) => !v)}
        disabled={pending}
      />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Updating the password…
          </>
        ) : (
          "Update the password"
        )}
      </button>
    </form>
  );
}
