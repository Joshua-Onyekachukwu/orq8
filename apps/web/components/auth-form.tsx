"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AuthMode = "login" | "register";

const fieldClass =
  "h-10 w-full rounded-md border border-hairline bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-700/20";
const labelClass = "mb-1 block text-sm font-medium text-ink";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Move focus to the alert so keyboard + screen-reader users hear the failure.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(e.currentTarget);
    const body: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    if (mode === "register") {
      body.name = String(form.get("name") ?? "");
      body.org_name = String(form.get("org_name") ?? "");
    }

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
            "That didn't work — check your details and try again. If it persists, the API may be down on :3001."
        );
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error — is the API running on :3001?");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {mode === "register" && (
        <div>
          <label htmlFor="name" className={labelClass}>
            Your name
          </label>
          <input id="name" name="name" autoComplete="name" className={fieldClass} placeholder="Ada Lovelace" />
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
          className={fieldClass}
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : undefined}
          className={fieldClass}
          placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-md bg-navy-800 text-sm font-medium text-white transition-colors hover:bg-navy-700 disabled:opacity-50"
      >
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create my organization"}
      </button>
    </form>
  );
}
