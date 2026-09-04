import { createLogger, loadConfig } from '@orq8/core';
import { describe, expect, it } from 'vitest';
import { createEmailTransport } from '../src/email/transport.js';

describe('email transport', () => {
  it('dev-log mode (no SMTP) reports ok without sending', async () => {
    const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
    expect(config.SMTP_HOST).toBeUndefined();
    const transport = createEmailTransport(config, createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    const result = await transport.send({
      to: 'ada@example.com',
      subject: 'Hi',
      text: 'body',
      html: '<p>body</p>',
    });
    expect(result.ok).toBe(true);
    expect(result.messageId).toMatch(/^dev-/);
  });

  // 20s budget: the transport's own 5s connect/greeting timeouts must make
  // send() fail fast against an unreachable host, with room for slow DNS.
  it('uses nodemailer config when SMTP_HOST is set', { timeout: 20_000 }, async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
    } as NodeJS.ProcessEnv);
    // Transport is created without connecting (nodemailer connects lazily), so
    // this only asserts the SMTP branch is taken without throwing.
    const transport = createEmailTransport(config, createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    expect(transport).toBeDefined();
    // A send against a fake host must return a failure result, not throw.
    const result = await transport.send({
      to: 'ada@example.com',
      subject: 'Hi',
      text: 'body',
      html: '<p>body</p>',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
