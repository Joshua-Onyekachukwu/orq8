import { pino, type Logger } from 'pino';
import type { AppConfig } from './config.js';

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { env: config.NODE_ENV, service: 'orq8-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger };
