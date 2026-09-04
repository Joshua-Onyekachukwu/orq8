"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";

type AuthMode = "login" | "register";

const fieldClass =
  "h-11 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink placeholder:text-muted outline-none transition-colors focus:border-orq8-green focus:ring-2 focus:ring-orq8-green/20 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-600";

/**
 * Validates a ?next= redirect target: internal absolute paths only, so the
 * value can never smuggle an open redirect (no //host, no backslash tricks).
 */
function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function AuthForm({
  mode,
  next,
}: {
  mode: AuthMode;
  next?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<{ secondsLeft: number; message: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const target = safeNext(next);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockout || lockout.secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setLockout((prev) => {
        if (!prev || prev.secondsLeft <= 1) return null;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockout?.secondsLeft]);

  // Move focus to the alert so keyboard + screen-reader users hear the failure.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (mode === "register") {
      const confirm = String(form.get("confirm_password") ?? "");
      if (confirm !== password) {
        setConfirmError("Passwords do not match.");
        return;
      }
      setConfirmError(null);
      if (!termsAccepted) {
        setError("Please accept the terms to continue.");
        return;
      }
    }

    const body: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password,
    };
    if (mode === "register") {
      body.name = String(form.get("name") ?? "");
      body.org_name = String(form.get("org_name") ?? "");
    }

    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Check for account lockout (429 + Retry-After header)
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 900;
          const errorData = data as { error?: { code?: string; message?: string } } | null;
          setLockout({
            secondsLeft: retrySeconds,
            message: errorData?.error?.message ?? `Too many failed attempts. Try again in ${Math.ceil(retrySeconds / 60)} minutes.`,
          });
          setError(null);
        } else {
          setError(
            (data as { error?: string } | null)?.error ??
              "That didn't work. Check your details and try again."
          );
        }
        return;
      }
      router.push(target ?? "/app");
      router.refresh();
    } catch {
      setError("Network error. Is the API running?");
    } finally {
      setPending(false);
    }
  }

  const PasswordField = ({
    id,
    name,
    label = "Password",
    placeholder,
    autoComplete,
    show,
    onToggle,
    minLength,
  }: {
    id: string;
    name: string;
    label?: string;
    placeholder: string;
    autoComplete: string;
    show: boolean;
    onToggle: () => void;
    minLength?: number;
  }) => (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required
          autoComplete={autoComplete}
          minLength={minLength}
          disabled={pending}
          className={`${fieldClass} pr-11`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-orq8-green"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      {lockout && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Account temporarily locked</p>
              <p className="mt-1 text-xs text-amber-700">
                {lockout.message}
              </p>
              <p className="mt-2 font-mono text-lg font-bold text-amber-800 tabular-nums">
                {Math.floor(lockout.secondsLeft / 60)}:{String(lockout.secondsLeft % 60).padStart(2, '0')}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && !lockout && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {mode === "register" && (
        <div>
          <label htmlFor="name" className={labelClass}>
            Your name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            disabled={pending}
            className={fieldClass}
            placeholder="Ada Lovelace"
          />
        </div>
      )}

      {mode === "register" && (
        <div>
          <label htmlFor="org_name" className={labelClass}>
            Company / organization name
          </label>
          <input
            id="org_name"
            name="org_name"
            required
            autoComplete="organization"
            disabled={pending}
            className={fieldClass}
            placeholder="Acme Inc."
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
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
        />
      </div>

      <PasswordField
        id="password"
        name="password"
        placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        minLength={mode === "register" ? 8 : undefined}
        show={showPassword}
        onToggle={() => setShowPassword((v) => !v)}
      />

      {mode === "register" && (
        <>
          <PasswordField
            id="confirm_password"
            name="confirm_password"
            label="Confirm password"
            placeholder="Repeat your password"
            autoComplete="new-password"
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
          />
          {confirmError && (
            <p role="alert" className="text-sm text-red-300">
              {confirmError}
            </p>
          )}
        </>
      )}

      {mode === "login" && (
        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-gray-600">
            <input
              type="checkbox"
              name="remember"
              disabled={pending}
              className="h-4 w-4 rounded border-gray-300 bg-white accent-emerald"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className="font-medium text-orq8-green transition-colors hover:text-orq8-green/80"
          >
            Forgot password?
          </Link>
        </div>
      )}

      {mode === "register" && (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white accent-emerald"
          />
          <span>
            I accept the{" "}
            <Link
              href="/settings/terms-conditions"
              target="_blank"
              className="font-medium text-orq8-green transition-colors hover:text-orq8-green/80"
            >
              terms
            </Link>{" "}
            and{" "}
            <Link
              href="/settings/privacy-policy"
              target="_blank"
              className="font-medium text-orq8-green transition-colors hover:text-orq8-green/80"
            >
              privacy policy
            </Link>
            .
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orq8-dark text-sm font-semibold text-white transition-colors hover:bg-orq8-dark/90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {mode === "login" ? "Signing in…" : "Creating your organization…"}
          </>
        ) : mode === "login" ? (
          "Sign in"
        ) : (
          "Create my organization"
        )}
      </button>
    </form>
  );
}
