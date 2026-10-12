/** Capability ping: one tiny completion per provider through the app's own
 *  chain. Prints serving model + latency + output. Costs fractions of a cent.
 *  Run: pnpm --filter @orq8/api exec tsx scripts/pico-capability-ping.ts */
import 'dotenv/config';
import { loadConfig } from '@orq8/core';
import { chatCompletion } from '../src/services/llm.js';

const base = loadConfig(process.env as NodeJS.ProcessEnv);
const prompt = 'Reply with exactly this token and nothing else: PING-OK';

async function ping(label: string, config: typeof base) {
  const t0 = Date.now();
  try {
    const res = await chatCompletion(config, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 12,
      temperature: 0,
      retries: 0,
    });
    const msg = res?.choices?.[0]?.message as { content?: string } | undefined;
    console.log(`${label}: model=${(res as { model?: string })?.model ?? '?'} latencyMs=${Date.now() - t0} output=${JSON.stringify(msg?.content?.trim() ?? null)}`);
  } catch (err) {
    console.log(`${label}: ERROR latencyMs=${Date.now() - t0} ${(err as Error).message.slice(0, 160)}`);
  }
}

await ping('openrouter-chain', base);
await ping('nvidia-forced', { ...base, OPENROUTER_API_KEY: undefined, OPENROUTER_API_KEYS: undefined });
