"use client";

import { useEffect } from "react";
import { useExecutiveAgent, type FounderStage } from "../executive-agent-context";

/**
 * Reports the dashboard's persisted onboarding stage and page context to the
 * Executive Agent panel so its greeting, empty state, and suggestions match
 * what the founder has actually completed (server-derived state, never
 * inferred from frontend state).
 */
export function EAStageRegistrar({
  stage,
  route,
  pageName,
}: {
  stage: FounderStage;
  route: string;
  pageName: string;
}) {
  const { setFounderStage, setPageContext } = useExecutiveAgent();
  useEffect(() => {
    setFounderStage(stage);
    setPageContext({ route, pageName });
    return () => {
      setFounderStage(null);
      setPageContext(null);
    };
  }, [stage, route, pageName, setFounderStage, setPageContext]);
  return null;
}
