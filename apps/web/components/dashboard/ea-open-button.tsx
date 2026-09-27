"use client";

import type { ReactNode } from "react";
import { useExecutiveAgent } from "../executive-agent-context";

/**
 * Button that opens the Executive Agent panel, optionally pre-filling the
 * input with a starter prompt (e.g. "I'm building " on the first-run
 * dashboard) so the founder can continue the sentence naturally.
 */
export function EAOpenButton({
  prompt,
  className,
  children,
}: {
  prompt?: string;
  className?: string;
  children: ReactNode;
}) {
  const { openPanel } = useExecutiveAgent();
  return (
    <button type="button" className={className} onClick={() => openPanel(prompt)}>
      {children}
    </button>
  );
}
