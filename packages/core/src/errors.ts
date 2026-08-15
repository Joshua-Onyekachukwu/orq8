import type { ErrorEnvelope } from '@orq8/domain';

// docs/35.1 — errors: HTTP status + envelope { error: { code, message, details?, policy_ref? } }
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly policyRef?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'auth.unauthorized', message);
export const sessionExpired = (message = 'Session has expired') =>
  new AppError(401, 'auth.session_expired', message);
export const forbidden = (message = 'Not allowed', policyRef?: string) =>
  new AppError(403, 'auth.forbidden', message, undefined, policyRef);
export const validation = (details: unknown) =>
  new AppError(400, 'validation.failed', 'Request validation failed', details);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message = 'Conflict') => new AppError(409, 'conflict', message);
export const internal = (message = 'Internal server error') =>
  new AppError(500, 'internal', message);

export function toErrorEnvelope(
  error: AppError,
  requestId?: string,
): ErrorEnvelope['error'] {
  const env: ErrorEnvelope['error'] = {
    code: error.code,
    message: error.message,
    request_id: requestId,
  };
  if (error.details !== undefined) env.details = error.details;
  if (error.policyRef) env.policy_ref = error.policyRef;
  return env;
}
