"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type AuthMode = "login" | "register";

const fieldClass =
  "h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3.5 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-emerald/60 focus:ring-2 focus:ring-emerald/25 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm font-medium text-white/70";

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
  const errorRef = useRef<HTMLDivElement>(null);
  const target = safeNext(next);

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
        setError(
          (data as { error?: string } | null)?.error ??
            "That didn't work. Check your details and try again. If it persists, the API may be down."
        );
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-lime"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-200"
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
          <label className="flex cursor-pointer items-center gap-2 text-white/60">
            <input
              type="checkbox"
              name="remember"
              disabled={pending}
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-emerald"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className="font-medium text-emerald/70 transition-colors hover:text-emerald"
          >
            Forgot password?
          </Link>
        </div>
      )}

      {mode === "register" && (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-emerald"
          />
          <span>
            I accept the{" "}
            <Link
              href="/settings/terms-conditions"
              target="_blank"
              className="font-medium text-emerald transition-colors hover:text-lime"
            >
              terms
            </Link>{" "}
            and{" "}
            <Link
              href="/settings/privacy-policy"
              target="_blank"
              className="font-medium text-emerald transition-colors hover:text-lime"
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
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald text-sm font-semibold text-navy-950 transition-colors hover:bg-lime active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
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
