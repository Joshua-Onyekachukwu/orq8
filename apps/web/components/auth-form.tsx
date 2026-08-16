"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AuthMode = "login" | "register";

const fieldClass =
  "h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-emerald/60 focus:ring-2 focus:ring-emerald/25";
const labelClass = "mb-1 block text-sm font-medium text-white/70";

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
            "That didn't work — check your details and try again. If it persists, the API may be down."
        );
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error — is the API running?");
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
          className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
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
        className="h-10 w-full rounded-md bg-emerald text-sm font-semibold text-navy-950 transition-colors hover:bg-lime active:translate-y-px disabled:opacity-50"
      >
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create my organization"}
      </button>
    </form>
  );
}
