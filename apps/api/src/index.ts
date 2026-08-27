import 'dotenv/config';
import { createLogger, initTracing, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { buildApp } from './app.js';
import { getRedis } from './services/redis.js';

async function main(): Promise<void> {
  const config = loadConfig();
  initTracing(config.OTEL_EXPORTER_OTLP_ENDPOINT);
  const logger = createLogger(config);
  const { db, pool } = createDb(config.DATABASE_URL);
  const redis = getRedis(config, logger);

  const app = await buildApp({ config, db, pool, logger, redis });
  const address = await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info({ address }, 'orq8-api listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await redis.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal startup error:', err);
  process.exit(1);
});
