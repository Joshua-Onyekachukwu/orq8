"use client";

import { PageErrorBoundary } from "./page-error-boundary";

/**
 * Client wrapper for server components that need error boundary protection.
 * Server components can't use ErrorBoundary directly, so they wrap their
 * content in this component.
 *
 * Usage in a server page:
 *   import { PageShell } from "../../components/page-shell";
 *   export default async function MyPage() {
 *     return <PageShell pageName="My Page">{content}</PageShell>;
 *   }
 */
export function PageShell({
  children,
  pageName,
  backHref,
}: {
  children: React.ReactNode;
  pageName: string;
  backHref?: string;
}) {
  return (
    <PageErrorBoundary pageName={pageName} backHref={backHref}>
      {children}
    </PageErrorBoundary>
  );
}
