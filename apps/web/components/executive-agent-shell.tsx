"use client";

/**
 * ExecutiveAgentShell — thin client wrapper that provides the
 * ExecutiveAgentProvider context + the persistent panel UI.
 *
 * Wraps all page content in the app layout so pages can register page
 * context, report the onboarding stage, and open the panel with a queued
 * prompt — without interfering with server-side rendering.
 */

import type { ReactNode } from "react";
import { ExecutiveAgentProvider } from "./executive-agent-context";
import { ExecutiveAgentPanel } from "./executive-agent-panel";

export function ExecutiveAgentShell({
  userId,
  eaName,
  children,
}: {
  userId: string | null;
  /** The active org's Executive Agent name (settings.eaName), if renamed. */
  eaName?: string | null;
  children: ReactNode;
}) {
  return (
    <ExecutiveAgentProvider userId={userId} eaName={eaName}>
      {children}
      <ExecutiveAgentPanel />
    </ExecutiveAgentProvider>
  );
}
