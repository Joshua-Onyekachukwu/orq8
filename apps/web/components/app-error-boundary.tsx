"use client";

import { ErrorBoundary } from "./error-boundary";

/**
 * Client-side error boundary wrapper for the app layout.
 * Catches any render errors in child pages and shows recovery UI.
 */
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary name="app-layout">
      {children}
    </ErrorBoundary>
  );
}
