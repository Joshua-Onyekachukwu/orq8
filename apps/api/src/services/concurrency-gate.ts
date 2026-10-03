/**
 * Provider concurrency gate (docs/80 §3.3, docs/77 P1 §8).
 *
 * Rate limits bound requests per unit of time; this bounds how many LLM calls
 * are IN FLIGHT at once. Providers publish concurrency limits, and a burst of
 * parallel tasks that ignores them collects 429s (wasting provider spend and
 * task time). The gate is process-local and honest about it: with N replicas
 * the effective ceiling is N × the configured value.
 *
 * A waiter that exceeds its patience gives up with `GateTimeoutError` — the
 * caller (the provider fallback chain) then moves to the next provider rather
 * than hanging a task behind a saturated one.
 */

import type { AppConfig } from '@orq8/core';

export class GateTimeoutError extends Error {
  constructor(
    public readonly gate: string,
    public readonly waitTimeoutMs: number,
  ) {
    super(`concurrency gate "${gate}" saturated for ${waitTimeoutMs}ms`);
    this.name = 'GateTimeoutError';
  }
}

interface Waiter {
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A counting semaphore with a FIFO queue and a bounded wait.
 */
export class ConcurrencyGate {
  private active = 0;
  private queue: Waiter[] = [];

  constructor(
    public readonly name: string,
    private readonly max: number,
    private readonly waitTimeoutMs: number,
  ) {}

  get activeCount(): number {
    return this.active;
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  /** Resolves with a release function; rejects with GateTimeoutError. */
  async acquire(): Promise<() => void> {
    if (this.max <= 0) return () => undefined; // cap disabled

    if (this.active < this.max) {
      this.active += 1;
      return this.releaseFn;
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const idx = this.queue.indexOf(waiter);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject(new GateTimeoutError(this.name, this.waitTimeoutMs));
        }, this.waitTimeoutMs),
      };
      waiter.timer.unref?.();
      this.queue.push(waiter);
    });
  }

  private releaseFn = (): void => {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      // Hand the slot straight to the next waiter: `active` never dips, so a
      // burst cannot slip past the ceiling between release and re-acquire.
      next.resolve(this.releaseFn);
      return;
    }
    this.active = Math.max(0, this.active - 1);
  };
}

// ─── Provider slot registry ─────────────────────────────────────────────────

const gates = new Map<string, ConcurrencyGate>();

function getGate(name: string, max: number, waitTimeoutMs: number): ConcurrencyGate {
  let gate = gates.get(name);
  if (!gate) {
    gate = new ConcurrencyGate(name, max, waitTimeoutMs);
    gates.set(name, gate);
  }
  return gate;
}

/**
 * Acquire one slot for a provider call: the global LLM ceiling first, then the
 * provider's own. Returns a single release function (idempotent per call site).
 */
export async function acquireProviderSlot(config: AppConfig, providerId: string): Promise<() => void> {
  const waitMs = config.LLM_CONCURRENCY_WAIT_MS;
  const globalGate = getGate('__llm_global', config.LLM_MAX_CONCURRENT, waitMs);
  const providerGate = getGate(`provider:${providerId}`, config.LLM_MAX_CONCURRENT_PER_PROVIDER, waitMs);

  const releaseGlobal = await globalGate.acquire();
  try {
    const releaseProvider = await providerGate.acquire();
    return () => {
      releaseProvider();
      releaseGlobal();
    };
  } catch (err) {
    releaseGlobal();
    throw err;
  }
}

/** Snapshot of gate pressure — used by tests and (later) the admin console. */
export function providerGateStats(): Array<{ name: string; active: number; waiting: number }> {
  return [...gates.values()].map((g) => ({ name: g.name, active: g.activeCount, waiting: g.waitingCount }));
}

/** Test hook — drops all gates so a fresh config takes effect. */
export function __resetConcurrencyGates(): void {
  gates.clear();
}
