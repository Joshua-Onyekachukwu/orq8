// Build the Vercel serverless function as ONE self-contained CJS bundle
// (docs/58). The Vercel node builder's own tsc pipeline can't resolve our
// workspace packages' types reliably, so we bundle everything (including
// @orq8/* packages, fastify, drizzle, pg) into a single file that needs no
// node_modules resolution at runtime.
//
// The bundle is COMMITTED at api/index.js — Vercel auto-discovers functions in
// the api/ directory (vercel.json `functions` config cannot see files that the
// build command generates, so the output must exist in the repo).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..');

await build({
  entryPoints: [join(apiRoot, 'src/serverless.ts')],
  outfile: join(apiRoot, 'api/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  // CJS on purpose: an ESM bundle wraps CJS deps (pino etc.) in a __commonJS
  // shim whose internal `require("node:os")` is a DYNAMIC require — Vercel's
  // Lambda runtime rejects it in ESM ("Dynamic require of node:os is not
  // supported"). CJS requires are native. api/package.json overrides the
  // parent "type": "module" so the bundle loads as CJS.
  format: 'cjs',
  sourcemap: false,
  // Expose the handler directly as module.exports (works with both the
  // @vercel/node bridge and the Rust runtime's mod.default || mod check).
  footer: { js: 'module.exports = module.exports.default;' },
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

console.log('[build] api/index.js ready (committed artifact)');
