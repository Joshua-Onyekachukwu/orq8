"use client";

/**
 * ExecutiveAgentShell — thin client wrapper that provides the
 * ExecutiveAgentProvider context + the persistent panel UI.
 *
 * Placed in the app layout so it's available on every authenticated page
 * without interfering with server-side rendering or navigation.
 */

import { ExecutiveAgentProvider } from "./executive-agent-context";
import { ExecutiveAgentPanel } from "./executive-agent-panel";

export function ExecutiveAgentShell() {
  return (
    <ExecutiveAgentProvider>
      <ExecutiveAgentPanel />
    </ExecutiveAgentProvider>
  );
}
