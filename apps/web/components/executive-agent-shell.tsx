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
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  return (
    <ExecutiveAgentProvider userId={userId}>
      {children}
      <ExecutiveAgentPanel />
    </ExecutiveAgentProvider>
  );
}
