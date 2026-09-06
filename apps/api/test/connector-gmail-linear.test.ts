/**
 * Pure unit tests for connector validation logic that needs no database:
 * Gmail MIME building + recipient validation, and the shared ConnectorActionError
 * shape used by the GitHub/Gmail/Linear dispatchers.
 */

import { describe, expect, it } from 'vitest';
import { buildMimeMessage, isEmailValid } from '../src/services/connector-gmail.js';
import { ConnectorActionError } from '../src/services/connector-actions.js';

describe('connector gmail — pure helpers', () => {
  it('validates email addresses conservatively', () => {
    expect(isEmailValid('founder@orq8.com')).toBe(true);
    expect(isEmailValid('a.b+c@sub.example.co')).toBe(true);
    expect(isEmailValid('not-an-email')).toBe(false);
    expect(isEmailValid('a@b')).toBe(false);
    expect(isEmailValid('')).toBe(false);
    expect(isEmailValid(`${'x'.repeat(400)}@example.com`)).toBe(false);
  });

  it('builds a base64url MIME message with To/Subject/body', () => {
    const raw = buildMimeMessage({ to: ['alice@example.com'], subject: 'Hello', body: 'Hi Alice' });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: alice@example.com');
    expect(decoded).toContain('Subject: Hello');
    expect(decoded).toContain('Hi Alice');
    expect(decoded).not.toContain('Cc:');
  });

  it('adds Cc and reply headers only when supplied', () => {
    const withCc = buildMimeMessage({ to: ['a@example.com'], cc: ['b@example.com'], subject: 's', body: 'b' });
    const decoded = Buffer.from(withCc, 'base64url').toString('utf8');
    expect(decoded).toContain('Cc: b@example.com');

    const reply = buildMimeMessage({ to: ['a@example.com'], subject: 's', body: 'b', inReplyToMessageId: 'msg-1' });
    const decodedReply = Buffer.from(reply, 'base64url').toString('utf8');
    expect(decodedReply).toContain('In-Reply-To:');
    expect(decodedReply).toContain('msg-1');
  });
});

describe('ConnectorActionError — predictable structured failure shape', () => {
  it('carries a stable code for capability denial', () => {
    const err = new ConnectorActionError('Agent is not authorized', 'capability_denied');
    expect(err.code).toBe('capability_denied');
    expect(err.message).toContain('not authorized');
    expect(err instanceof Error).toBe(true);
  });

  it('distinguishes validation failures from provider failures', () => {
    const validationErr = new ConnectorActionError('title is required', 'invalid_params');
    const providerErr = new ConnectorActionError('GitHub rejected', 'provider_error');
    expect(validationErr.code).toBe('invalid_params');
    expect(providerErr.code).toBe('provider_error');
  });
});
