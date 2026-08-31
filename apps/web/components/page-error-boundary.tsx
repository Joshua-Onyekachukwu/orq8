"use client";

import { ErrorBoundary } from "./error-boundary";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Per-page error boundary wrapper.
 * Catches render errors in a single page and shows recovery UI
 * without taking down the sidebar or other pages.
 *
 * Usage:
 *   <PageErrorBoundary pageName="Agents">
 *     <AgentsContent />
 *   </PageErrorBoundary>
 */
export function PageErrorBoundary({
  children,
  pageName,
  backHref,
}: {
  children: React.ReactNode;
  pageName: string;
  backHref?: string;
}) {
  return (
    <ErrorBoundary
      name={`page:${pageName}`}
      fallbackTitle={`${pageName} encountered an error`}
      fallbackDescription={`The ${pageName} section hit an unexpected error. You can retry or navigate away — the rest of your dashboard is unaffected.`}
      showNavigation
      backHref={backHref}
    >
      {children}
    </ErrorBoundary>
  );
}
