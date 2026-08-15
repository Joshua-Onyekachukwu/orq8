import { describe, expect, it } from 'vitest';
import { AppError, toErrorEnvelope, validation } from '../src/errors.js';

describe('errors (docs/35.1 envelope)', () => {
  it('builds the envelope with optional fields', () => {
    const err = new AppError(409, 'conflict', 'duplicate', { key: 'x' }, 'constitution#5');
    expect(toErrorEnvelope(err, 'req-1')).toEqual({
      code: 'conflict',
      message: 'duplicate',
      details: { key: 'x' },
      policy_ref: 'constitution#5',
      request_id: 'req-1',
    });
  });

  it('omits optional fields when absent', () => {
    expect(toErrorEnvelope(new AppError(404, 'not_found', 'nope'))).toEqual({
      code: 'not_found',
      message: 'nope',
      request_id: undefined,
    });
  });

  it('validation errors carry 400 + zod details', () => {
    const err = validation({ issues: [{ path: ['email'] }] });
    expect(err.status).toBe(400);
    expect(err.code).toBe('validation.failed');
  });
});
