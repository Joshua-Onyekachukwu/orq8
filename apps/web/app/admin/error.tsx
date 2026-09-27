"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin Error]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-ink">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-muted">
          {error.name === "ApiRequestError"
            ? error.message
            : "The admin page encountered an unexpected error. Your data is safe. Try again in a moment."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-orq8-green px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-lg border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            <Home aria-hidden="true" className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
