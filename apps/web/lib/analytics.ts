/**
 * ORQ8 Analytics — PostHog Integration
 *
 * This module provides a thin analytics abstraction that wraps PostHog.
 * When POSTHOG_KEY is set, events are sent to PostHog.
 * When not set, events are logged to console (dev mode).
 *
 * Setup:
 *   1. Create a PostHog project at posthog.com
 *   2. Add POSTHOG_KEY and POSTHOG_HOST to Railway env vars
 *   3. The analytics provider auto-initializes on app load
 *
 * Events tracked:
 *   - Page views (automatic via provider)
 *   - Feature usage (goals created, agents hired, commands sent)
 *   - Auth events (register, login, logout)
 *   - AI execution events (command sent, task completed, agent delegated)
 *   - Provider events (key added, provider tested)
 *   - Error events (API failures, LLM failures)
 *   - Performance events (slow requests, timeouts)
 */

"use client";

// PostHog instance (lazy-loaded, typed as any to avoid hard dep)
let posthogInstance: any = null;

/**
 * Initialize PostHog. Call once on app mount.
 */
export async function initAnalytics(options: {
  key?: string;
  host?: string;
  userId?: string;
  orgId?: string;
  userName?: string;
  userEmail?: string;
}): Promise<void> {
  const key = options.key || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    options.host ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://us.i.posthog.com";

  if (!key) {
    console.log("[analytics] No POSTHOG_KEY set — events logged to console only");
    return;
  }

  try {
    const mod = await import(/* webpackIgnore: true */ "posthog-js").catch(() => null);
    if (!mod) return;
    const PostHog = mod.default;
    PostHog.init(key, {
      api_host: host,
      autocapture: false, // We control what we capture
      persistence: "localStorage",
      capture_pageview: false, // We handle page views manually
      capture_pageleave: true,
    });
    posthogInstance = PostHog;

    if (options.userId) {
      PostHog.identify(options.userId, {
        org_id: options.orgId,
        name: options.userName,
        email: options.userEmail,
      });
    }
  } catch {
    console.warn("[analytics] Failed to initialize PostHog");
  }
}

/**
 * Track an analytics event.
 */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (posthogInstance) {
    posthogInstance.capture(event, properties);
  } else {
    console.log(`[analytics] ${event}`, properties);
  }
}

/**
 * Identify the current user.
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (posthogInstance) {
    posthogInstance.identify(userId, properties);
  }
}

/**
 * Reset analytics (on logout).
 */
export function resetAnalytics(): void {
  if (posthogInstance) {
    posthogInstance.reset();
  }
}

// ─── Preset Events ──────────────────────────────────────────────────────────

export const analytics = {
  // Auth
  userRegistered: (method: "email" | "google") =>
    track("user_registered", { method }),
  userLoggedIn: (method: "email" | "google") =>
    track("user_logged_in", { method }),
  userLoggedOut: () => track("user_logged_out"),

  // Onboarding
  onboardingStarted: () => track("onboarding_started"),
  onboardingCompleted: (steps: number) =>
    track("onboarding_completed", { steps }),

  // Agents
  agentHired: (role: string) => track("agent_hired", { role }),
  agentPaused: (agentId: string) => track("agent_paused", { agent_id: agentId }),
  agentResumed: (agentId: string) => track("agent_resumed", { agent_id: agentId }),
  agentEmergencyStop: () => track("agent_emergency_stop"),

  // Goals
  goalCreated: (priority: string) => track("goal_created", { priority }),
  goalCompleted: (goalId: string) => track("goal_completed", { goal_id: goalId }),

  // Commands
  commandSent: (command: string, length: number) =>
    track("command_sent", { command_length: length }),
  commandCompleted: (status: string, durationMs: number) =>
    track("command_completed", { status, duration_ms: durationMs }),

  // AI Execution
  taskCreated: (agentRole: string) =>
    track("task_created", { agent_role: agentRole }),
  taskCompleted: (agentRole: string, durationMs: number) =>
    track("task_completed", { agent_role: agentRole, duration_ms: durationMs }),
  taskFailed: (agentRole: string, error: string) =>
    track("task_failed", { agent_role: agentRole, error }),
  toolExecuted: (toolId: string, success: boolean) =>
    track("tool_executed", { tool_id: toolId, success }),

  // Providers
  providerKeyAdded: (provider: string) =>
    track("provider_key_added", { provider }),
  providerKeyTested: (provider: string, success: boolean) =>
    track("provider_key_tested", { provider, success }),
  providerFallback: (from: string, to: string, reason: string) =>
    track("provider_fallback", { from, to, reason }),

  // Credits
  creditsLow: (remaining: number) =>
    track("credits_low", { remaining }),
  creditsExhausted: () => track("credits_exhausted"),

  // Errors
  apiError: (endpoint: string, status: number) =>
    track("api_error", { endpoint, status }),
  llmError: (provider: string, error: string) =>
    track("llm_error", { provider, error }),

  // Performance
  slowRequest: (endpoint: string, durationMs: number) =>
    track("slow_request", { endpoint, duration_ms: durationMs }),

  // Navigation
  pageViewed: (page: string) => track("$pageview", { page }),
};
