import { z } from 'zod';

// docs/35.1 + 35.4 — error envelope and the initial error code set
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    policy_ref: z.string().optional(),
    request_id: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

export const ERROR_CODES = [
  'auth.unauthorized',
  'auth.session_expired',
  'auth.forbidden',
  'validation.failed',
  'not_found',
  'conflict',
  'approval.required',
  'approval.expired',
  'approval.rejected',
  'budget.ceiling_reached',
  'budget.warning',
  'emergency.paused',
  'limit.exceeded',
  'provider.unavailable',
  'model.insufficient',
  'tool.denied',
  'integration.failed',
  'idempotency.replay',
  'idempotency.conflict',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
