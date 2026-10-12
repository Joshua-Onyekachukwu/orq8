/** Pico-probe: provider health via the app's own probes. Prints status/latency
 *  only — never key material. Run: pnpm --filter @orq8/api exec tsx scripts/pico-provider-probe.ts */
import 'dotenv/config';
import { loadConfig } from '@orq8/core';
import { probeAllProviders } from '../src/services/provider-health.js';

const config = loadConfig(process.env as NodeJS.ProcessEnv);
const result = await probeAllProviders(config);
for (const p of result.providers) {
  console.log(
    `${p.slug}: status=${p.status} configured=${p.configured} keys=${p.keyCount} latencyMs=${p.latencyMs} models=${p.modelsAvailable.slice(0, 6).join(',')}${p.error ? ` error=${p.error.slice(0, 160)}` : ''}`,
  );
}
console.log(`summary: ${JSON.stringify(result.summary)}`);
