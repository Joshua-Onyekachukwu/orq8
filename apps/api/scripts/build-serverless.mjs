// Build the Vercel serverless function as ONE self-contained CJS bundle
// (docs/58). The Vercel node builder's own tsc pipeline can't resolve our
// workspace packages' types reliably, so we bundle everything (including
// @orq8/* packages, fastify, drizzle, pg) into a single file that needs no
// node_modules resolution at runtime.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..');

await build({
  entryPoints: [join(apiRoot, 'src/serverless.ts')],
  outfile: join(apiRoot, 'dist/serverless.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  // Workspace packages resolve straight to their TS sources — esbuild bundles
  // them, so no dist build of the packages is required for deploy.
  alias: {
    '@orq8/core': join(apiRoot, '../../packages/core/src/index.ts'),
    '@orq8/db': join(apiRoot, '../../packages/db/src/index.ts'),
    '@orq8/domain': join(apiRoot, '../../packages/domain/src/index.ts'),
    '@orq8/auth': join(apiRoot, '../../packages/auth/src/index.ts'),
  },
  // pg's optional native deps aren't installed; keep them external.
  // @node-rs/argon2 loads a platform-specific .node binding via a dynamic
  // require() that esbuild can't bundle — keep it external too; Vercel traces
  // the real npm package (with the correct Linux binding) into the Lambda.
  external: ['pg-native', 'pg-cloudflare', '@node-rs/*'],
  logLevel: 'info',
});

console.log('[build] dist/serverless.cjs ready');
