/**
 * Layered rate-limit plugin (docs/80 §3.3).
 *
 * Two enforcement points, one table of endpoint classes:
 *
 *   1. `registerLayeredRateLimits` — an `onRequest` hook that maps the request
 *      to an endpoint class and counts it against the **user/session** bucket.
 *      Runs before auth on purpose: it must be cheap and must also cover
 *      requests that fail auth.
 *   2. `enforceOrgLimit` / `enforceAgentJobQuota` — called by handlers after
 *      `requireAuth`, where `orgId` (and, at the enqueue points, `agentId`)
 *      are known. These close fan-out: N members of one company share the
 *      company bucket no matter how many sessions they hold.
 *
 * The layered system can be disabled wholesale with `RATE_LIMIT_ENABLED=false`
 * and is off under `NODE_ENV=test` unless `RATE_LIMIT_FORCE=true`, so existing
 * suites are not rewritten by a new ceiling; the abuse suite and the review
 * stack force it on to assert the real limits.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDeps } from '../types.js';
import { sessionOrIpKey } from './rate-limit-redis.js';
import {
  endpointClassByName,
  getRateLimiter,
  matchEndpointClass,
  orgLimitKey,
  userLimitKey,
  RATE_LIMIT_WINDOWS,
  type EndpointClassName,
  type RateLimitVerdict,
} from '../services/rate-limit-service.js';
import { countAgentJobsLastHour } from '../services/jobs.js';

const ALWAYS_ALLOW: RateLimitVerdict = {
  allowed: true,
  remaining: Number.MAX_SAFE_INTEGER,
  retryAfterSec: 0,
  degraded: false,
};

export function layeredRateLimitsEnabled(deps: Pick<AppDeps, 'config'>): boolean {
  if (deps.config.RATE_LIMIT_ENABLED === 'false') return false;
  return deps.config.NODE_ENV !== 'test' || deps.config.RATE_LIMIT_FORCE === 'true';
}

/**
 * 429 with the same envelope shape every other limiter uses, plus the class
 * label so the caller can tell "slow down" from "the plan is out of credits".
 */
export function sendRateLimited(
  reply: FastifyReply,
  verdict: RateLimitVerdict,
  label: string,
): { error: { code: string; message: string; policy_ref: string } } {
  reply.header('Retry-After', String(verdict.retryAfterSec));
  reply.code(429);
  return {
    error: {
      code: 'rate_limited',
      message: `Too many ${label} requests. Please try again in ${verdict.retryAfterSec} seconds.`,
      policy_ref: 'docs/80 §3.3',
    },
  };
}

/**
 * Per-user/session layer. First match wins; requests outside the class table
 * are untouched (navigation and reads keep flowing under the legacy buckets).
 */
export function registerLayeredRateLimits(app: FastifyInstance, deps: AppDeps): void {
  if (!layeredRateLimitsEnabled(deps)) return;
  const limiter = getRateLimiter(deps.config, deps.logger);

  app.addHook('onRequest', async (request, reply) => {
    const cls = matchEndpointClass(deps.config, request.method, request.url);
    if (!cls) return;

    const verdict = await limiter.check(userLimitKey(sessionOrIpKey(request), cls.name), {
      windowMs: RATE_LIMIT_WINDOWS.MINUTE,
      max: cls.userPerMin,
      failClosed: true,
    });
    if (!verdict.allowed) {
      deps.logger.warn(
        { className: cls.name, key: sessionOrIpKey(request).slice(0, 24), degraded: verdict.degraded },
        'rate limit: user bucket exceeded',
      );
      return reply.send(sendRateLimited(reply, verdict, cls.label));
    }
  });
}

/**
 * Per-org layer for an endpoint class. Call after `requireAuth` and before the
 * expensive work starts.
 */
export async function enforceOrgLimit(
  deps: AppDeps,
  orgId: string,
  className: EndpointClassName,
): Promise<RateLimitVerdict> {
  if (!layeredRateLimitsEnabled(deps)) return ALWAYS_ALLOW;
  const cls = endpointClassByName(deps.config, className);
  const limiter = getRateLimiter(deps.config, deps.logger);
  const verdict = await limiter.check(orgLimitKey(orgId, className), {
    windowMs: RATE_LIMIT_WINDOWS.HOUR,
    max: cls.orgPerHour,
    failClosed: true,
  });
  if (!verdict.allowed) {
    deps.logger.warn({ orgId, className, degraded: verdict.degraded }, 'rate limit: org bucket exceeded');
  }
  return verdict;
}

/**
 * Per-agent layer: how many jobs this AI employee has generated in the last
 * hour. Counted from `agent_jobs` (the durable queue) rather than a counter,
 * so a restart or a Redis flush cannot forget the loop that is already running.
 * Returns ALWAYS_ALLOW when the cap is disabled (0) or the task has no agent.
 */
export async function enforceAgentJobQuota(
  deps: AppDeps,
  orgId: string,
  agentId: string | null | undefined,
): Promise<RateLimitVerdict> {
  if (!layeredRateLimitsEnabled(deps)) return ALWAYS_ALLOW;
  const cap = deps.config.RATE_LIMIT_AGENT_JOBS_PER_HOUR;
  if (cap <= 0 || !agentId) return ALWAYS_ALLOW;

  const used = await countAgentJobsLastHour(deps.db, orgId, agentId);
  if (used < cap) {
    return { allowed: true, remaining: cap - used, retryAfterSec: 0, degraded: false };
  }
  deps.logger.warn({ orgId, agentId, used, cap }, 'rate limit: agent job quota exceeded');
  return { allowed: false, remaining: 0, retryAfterSec: 3600, degraded: false };
}
