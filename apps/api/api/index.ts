// Vercel serverless entry (docs/58_DEPLOYMENT.md).
//
// The exact same buildApp() as the long-lived server (src/index.ts) runs here;
// Fastify's inject() adapts it to Vercel's request/response shape without
// relying on a raw Node http server. The app + pg pool are cached at module
// scope so warm invocations skip the boot cost (and reuse Supabase connections).
import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/app.js';

// light-my-request (Fastify's inject) uses a closed method union; fastify's own
// re-export is a broader Autocomplete type that won't satisfy it directly.
type InjectMethod =
  | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
  | 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

let cachedApp: Promise<Awaited<ReturnType<typeof buildApp>>> | undefined;

function getApp(): Promise<Awaited<ReturnType<typeof buildApp>>> {
  if (!cachedApp) {
    cachedApp = (async () => {
      // Vercel never listens on a port here; drop PORT so a stray injected value
      // (e.g. the dev shell's PORT=0) can't fail schema validation.
      const { PORT: _port, ...serverlessEnv } = process.env;
      const config = loadConfig(serverlessEnv);
      const logger = createLogger(config);
      const { db, pool } = createDb(config.DATABASE_URL);
      const app = await buildApp({ config, db, pool, logger });
      await app.ready();
      return app;
    })();
  }
  return cachedApp;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const app = await getApp();
  const response = await app.inject({
    method: (req.method ?? 'GET') as InjectMethod,
    url: req.url ?? '/',
    headers: req.headers as Record<string, string | string[] | undefined>,
    // Vercel pre-parses JSON bodies; re-encode so Fastify's parser sees the raw payload.
    payload: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
  });

  res.statusCode = response.statusCode;
  for (const [name, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    res.setHeader(name, value as string);
  }
  res.end(response.body);
}
