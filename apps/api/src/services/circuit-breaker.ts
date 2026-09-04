/**
 * ORQ8 Circuit Breaker
 *
 * Prevents cascading failures when AI providers are down or degraded.
 * When a provider fails repeatedly, the circuit "opens" and stops sending
 * requests to it for a cooldown period. After the cooldown, it enters
 * "half-open" state and allows one test request. If it succeeds, the
 * circuit closes; if it fails, it opens again.
 *
 * States:
 *   CLOSED → (failures exceed threshold) → OPEN → (cooldown expires) → HALF_OPEN
 *   HALF_OPEN → (test request succeeds) → CLOSED
 *   HALF_OPEN → (test request fails) → OPEN
 *
 * Per-provider, per-model granularity so a failing model doesn't take down
 * the entire provider.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to keep the circuit open before trying half-open */
  cooldownMs: number;
  /** Maximum number of half-open test requests */
  halfOpenMaxAttempts: number;
  /** Success threshold in half-open state to close the circuit */
  halfOpenSuccessThreshold: number;
}

export interface CircuitState_ {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChange: number;
  halfOpenAttempts: number;
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000, // 1 minute
  halfOpenMaxAttempts: 1,
  halfOpenSuccessThreshold: 1,
};

// ─── State Store ────────────────────────────────────────────────────────────

const circuits = new Map<string, CircuitState_>();

function getCircuitKey(providerId: string, model?: string): string {
  return model ? `${providerId}:${model}` : providerId;
}

function getOrCreateCircuit(key: string): CircuitState_ {
  let circuit = circuits.get(key);
  if (!circuit) {
    circuit = {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      lastStateChange: Date.now(),
      halfOpenAttempts: 0,
    };
    circuits.set(key, circuit);
  }
  return circuit;
}

// ─── Circuit Operations ─────────────────────────────────────────────────────

/**
 * Check if a provider/model is available (circuit is not open).
 */
export function isAvailable(providerId: string, model?: string): boolean {
  const key = getCircuitKey(providerId, model);
  const circuit = getOrCreateCircuit(key);

  if (circuit.state === 'closed') return true;

  if (circuit.state === 'open') {
    // Check if cooldown has expired
    const config = DEFAULT_CONFIG;
    if (circuit.lastFailureTime && Date.now() - circuit.lastFailureTime >= config.cooldownMs) {
      // Transition to half-open
      circuit.state = 'half_open';
      circuit.halfOpenAttempts = 0;
      circuit.lastStateChange = Date.now();
      return true; // Allow one test request
    }
    return false; // Still in cooldown
  }

  if (circuit.state === 'half_open') {
    return circuit.halfOpenAttempts < DEFAULT_CONFIG.halfOpenMaxAttempts;
  }

  return false;
}

/**
 * Record a successful request. Closes the circuit if in half-open state.
 */
export function recordSuccess(providerId: string, model?: string): void {
  const key = getCircuitKey(providerId, model);
  const circuit = getOrCreateCircuit(key);

  circuit.lastSuccessTime = Date.now();

  if (circuit.state === 'half_open') {
    circuit.successCount++;
    if (circuit.successCount >= DEFAULT_CONFIG.halfOpenSuccessThreshold) {
      // Close the circuit
      circuit.state = 'closed';
      circuit.failureCount = 0;
      circuit.successCount = 0;
      circuit.halfOpenAttempts = 0;
      circuit.lastStateChange = Date.now();
    }
  } else if (circuit.state === 'closed') {
    // Reset failure count on success
    circuit.failureCount = 0;
  }
}

/**
 * Record a failed request. Opens the circuit if failure threshold is exceeded.
 */
export function recordFailure(providerId: string, model?: string): void {
  const key = getCircuitKey(providerId, model);
  const circuit = getOrCreateCircuit(key);

  circuit.failureCount++;
  circuit.lastFailureTime = Date.now();

  if (circuit.state === 'half_open') {
    // Failed in half-open — reopen the circuit
    circuit.state = 'open';
    circuit.halfOpenAttempts = 0;
    circuit.lastStateChange = Date.now();
  } else if (circuit.state === 'closed') {
    // Check if we should open the circuit
    if (circuit.failureCount >= DEFAULT_CONFIG.failureThreshold) {
      circuit.state = 'open';
      circuit.lastStateChange = Date.now();
    }
  }
}

/**
 * Get the current state of a circuit.
 */
export function getState(providerId: string, model?: string): CircuitState_ {
  const key = getCircuitKey(providerId, model);
  return getOrCreateCircuit(key);
}

/**
 * Get all circuit states (for admin monitoring).
 */
export function getAllCircuitStates(): Array<{
  key: string;
  providerId: string;
  model?: string;
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  cooldownRemainingMs: number;
}> {
  const result: Array<{
    key: string;
    providerId: string;
    model?: string;
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    cooldownRemainingMs: number;
  }> = [];

  for (const [key, circuit] of circuits) {
    const [providerId, model] = key.split(':');
    const cooldownRemaining = circuit.state === 'open' && circuit.lastFailureTime
      ? Math.max(0, DEFAULT_CONFIG.cooldownMs - (Date.now() - circuit.lastFailureTime))
      : 0;

    result.push({
      key,
      providerId: providerId ?? key,
      model,
      state: circuit.state,
      failureCount: circuit.failureCount,
      lastFailureTime: circuit.lastFailureTime,
      lastSuccessTime: circuit.lastSuccessTime,
      cooldownRemainingMs: cooldownRemaining,
    });
  }

  return result;
}

/**
 * Force-reset a circuit (for admin use).
 */
export function resetCircuit(providerId: string, model?: string): void {
  const key = getCircuitKey(providerId, model);
  circuits.delete(key);
}

/**
 * Force-reset all circuits.
 */
export function resetAllCircuits(): void {
  circuits.clear();
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

// Periodically clean up stale circuits (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const maxAge = 30 * 60_000; // 30 minutes
    for (const [key, circuit] of circuits) {
      if (circuit.state === 'closed' && circuit.lastSuccessTime && now - circuit.lastSuccessTime > maxAge) {
        circuits.delete(key);
      }
    }
  }, 300_000);
}
