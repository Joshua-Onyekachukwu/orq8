"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { scorePassword, type StrengthLabel } from "@/lib/password-strength";
import { OAuthButtons } from "./auth/oauth-buttons";
import { ResendVerification } from "./auth/resend-verification";

type AuthMode = "login" | "register";

// Dark surface: hairline borders, one accent (orange) for focus and action,
// spacing on the 4/8/12/16/24/32 scale, two font weights (normal + semibold).
const fieldClass =
  "h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#E86A33] focus:ring-2 focus:ring-[#E86A33]/25 disabled:opacity-50";
const labelClass = "mb-1.5 block text-sm text-white/70";

/**
 * Validates a ?next= redirect target: internal absolute paths only, so the
 * value can never smuggle an open redirect (no //host, no backslash tricks).
 */
function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  // Never send a signed-in founder back to an auth page: a crafted
  // ?next=/login would otherwise loop between this form and its page guard
  // (mirrors postAuthTarget in lib/auth-pages.ts).
  const authPages = [
    "/login",
    "/register",
    "/check-email",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
  ];
  if (authPages.some((p) => value === p || value.startsWith(`${p}/`) || value.startsWith(`${p}?`))) {
    return null;
  }
  return value;
}

// Plain-language reasons for every OAuth failure the callback can report, each
// ending with what to do next.
const OAUTH_MESSAGES: Record<string, string> = {
  cancelled: "The provider sign-in was cancelled. Try again below.",
  state_mismatch: "That sign-in link expired or was already used. Try again below.",
  not_configured:
    "That provider sign-in is not available on this deployment. Sign in with your email instead.",
  exchange_failed:
    "The provider did not complete the sign-in. Try again, or sign in with your email.",
  password_conflict:
    "A company already uses this email with a password. Sign in with your email and password below.",
  email_unverified:
    "The email on your provider account is not verified yet. Verify it with the provider, then try again.",
  email_missing:
    "Your provider account has no email ORQ8 can use. Sign in with your email instead.",
  start_failed: "Sign-in could not start. Try again below.",
  provider_unknown: "That sign-in option is not available. Use GitHub, Google, or your email.",
  provider_error: "The provider could not complete the sign-in. Try again, or sign in with your email.",
};

function PasswordField({
  id,
  name,
  label = "Password",
  placeholder,
  autoComplete,
  show,
  onToggle,
  minLength,
  withStrengthMeter,
  strength,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  label?: string;
  placeholder: string;
  autoComplete: string;
  show: boolean;
  onToggle: () => void;
  minLength?: number;
  withStrengthMeter?: boolean;
  strength?: { score: 0 | 1 | 2 | 3 | 4; label: StrengthLabel; suggestions: string[] };
  onChange?: (value: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    // Preserve focus and cursor position across type change
    const input = inputRef.current;
    const cursorPos = input?.selectionStart ?? 0;
    onToggle();
    // Restore focus and cursor after React re-render
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        try {
          input.setSelectionRange(cursorPos, cursorPos);
        } catch {
          // selectionRange not supported on some input types
        }
      }
    });
  };

  // On the dark surface: red and amber read as-is; the two green steps stay in
  // the brand hue without the lime that would break the palette rules.
  const meterColors: Record<StrengthLabel, string> = {
    weak: "bg-red-400",
    fair: "bg-amber-400",
    good: "bg-[#5f9f75]",
    strong: "bg-[#7fbf8f]",
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
          autoComplete={autoComplete}
          minLength={minLength}
          disabled={disabled}
          className={`${fieldClass} pr-11`}
          placeholder={placeholder}
          aria-describedby={withStrengthMeter && strength ? `${id}-strength` : undefined}
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
      {withStrengthMeter && strength && (
        <div id={`${id}-strength`} className="mt-2" aria-live="polite">
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
      )}
    </div>
  );
}

export function AuthForm({
  mode,
  next,
  oauthProviders = { github: false, google: false },
  oauthError,
}: {
  mode: AuthMode;
  next?: string | null;
  oauthProviders?: { github: boolean; google: boolean };
  oauthError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const passwordStrength = scorePassword(password);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<{ secondsLeft: number; message: string } | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const target = safeNext(next);
  const oauthNotice = oauthError ? OAUTH_MESSAGES[oauthError] ?? OAUTH_MESSAGES.provider_error : null;

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
    setUnverifiedEmail(null);

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const email = String(form.get("email") ?? "").trim();
    if (mode === "register") {
      const confirm = String(form.get("confirm_password") ?? "");
      if (confirm !== password) {
        setConfirmError("The passwords do not match. Re-enter them.");
        return;
      }
      setConfirmError(null);
      if (!termsAccepted) {
        setError("Accept the terms and privacy policy to create your company.");
        return;
      }
    }

    const body: Record<string, string> = { email, password };
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
      const data = (await res.json().catch(() => null)) as
        | { error?: string; code?: string }
        | null;
      if (!res.ok) {
        if (res.status === 429) {
          // 429 + Retry-After from the API's lockout / rate limiter.
          const retryAfter = res.headers.get("Retry-After");
          const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 900;
          setLockout({
            secondsLeft: retrySeconds,
            message:
              data?.error ??
              (mode === "login"
                ? "Too many sign-in attempts. Wait for the timer, then try again."
                : "Too many attempts. Wait for the timer, then try again."),
          });
          setError(null);
          return;
        }
        if (data?.code === "email_not_verified") {
          // Correct password, unconfirmed email: offer a resend instead of a dead end.
          setUnverifiedEmail(email);
          setError(null);
          return;
        }
        setError(
          data?.error ??
            (mode === "login"
              ? "Sign in failed. Check your email and password, then try again."
              : "Your company could not be created. Check your details and try again."),
        );
        return;
      }
      // Analytics: track the conversion (never send password/credentials)
      if (mode === "register") {
        analytics.userRegistered("email");
      } else {
        analytics.userLoggedIn("email");
      }
      if (mode === "register") {
        try {
          sessionStorage.setItem("orq8_verification_notice", "1");
        } catch {
          // Storage may be unavailable; /check-email reads the address server-side.
        }
        // A fresh account has an unconfirmed email: /check-email explains that
        // and offers a resend. Everything behind /app waits until it is confirmed.
        router.push("/check-email");
      } else {
        router.push(target ?? "/app");
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {lockout && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm text-amber-200">
                {mode === "login" ? "Too many sign-in attempts" : "Too many attempts"}
              </p>
              <p className="mt-1 text-xs text-amber-200/80">{lockout.message}</p>
              <p className="mt-2 font-mono text-lg text-amber-200 tabular-nums">
                {Math.floor(lockout.secondsLeft / 60)}:
                {String(lockout.secondsLeft % 60).padStart(2, "0")}
              </p>
            </div>
          </div>
        </div>
      )}

      {oauthNotice && !lockout && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200"
        >
          {oauthNotice}
        </div>
      )}

      {unverifiedEmail && !lockout && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
          <p className="text-sm text-white">Confirm your email to sign in</p>
          <p className="mt-1 text-xs text-white/60">
            We sent a confirmation link to {unverifiedEmail}. Open it to activate your company,
            then sign in again. Check your spam folder if it does not arrive within a few minutes.
          </p>
          <div className="mt-3">
            <ResendVerification defaultEmail={unverifiedEmail} />
          </div>
          <button
            type="button"
            onClick={() => setUnverifiedEmail(null)}
            className="mt-3 text-xs text-white/50 transition-colors hover:text-white"
          >
            Use a different email
          </button>
        </div>
      )}

      {error && !lockout && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
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
              Company name
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
          disabled={pending}
          placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : undefined}
          show={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          withStrengthMeter={mode === "register"}
          strength={passwordStrength}
          onChange={setPassword}
        />

        {mode === "register" && (
          <>
            <PasswordField
              id="confirm_password"
              name="confirm_password"
              disabled={pending}
              label="Confirm password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
            {confirmError && (
              <p role="alert" className="text-sm text-red-200">
                {confirmError}
              </p>
            )}
          </>
        )}

        {mode === "login" && (
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-white/60 transition-colors hover:text-white"
            >
              Forgot your password?
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
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.03] accent-[#E86A33]"
            />
            <span>
              I accept the{" "}
              <Link
                href="/settings/terms-conditions"
                target="_blank"
                className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
              >
                terms
              </Link>{" "}
              and{" "}
              <Link
                href="/settings/privacy-policy"
                target="_blank"
                className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
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
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orq8-orange-bright text-sm font-semibold text-orq8-dark transition-colors hover:bg-orq8-orange-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {mode === "login" ? "Signing in…" : "Creating your company…"}
            </>
          ) : mode === "login" ? (
            "Sign in"
          ) : (
            "Create company"
          )}
        </button>
      </form>

      <OAuthButtons providers={oauthProviders} next={target} />
    </div>
  );
}
