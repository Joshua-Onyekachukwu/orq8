"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-click demo company (MVP-020). Seeds the founder's EMPTY org with the
 * Northwind Labs sample company; the API refuses non-empty orgs (409) and
 * non-owners (403), and flags the org `isDemo` so every screen badges it.
 * On success the hub re-renders server-side into the living company.
 */
export function SeedDemoButton({ className }: { className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "seeding" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function seed() {
    if (state === "seeding") return;
    setState("seeding");
    setMessage(null);
    try {
      const res = await fetch("/api/demo-company", { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setState("error");
        setMessage(body?.error?.message ?? "Could not seed the demo company.");
        return;
      }
      router.refresh();
    } catch {
      setState("error");
      setMessage("Could not reach the server. Try again.");
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={seed} disabled={state === "seeding"} className={className}>
        {state === "seeding" ? "Seeding the demo company…" : "Explore with a demo company"}
      </button>
      {message ? (
        <span role="alert" className="text-xs text-white/80">
          {message}
        </span>
      ) : null}
    </span>
  );
}
