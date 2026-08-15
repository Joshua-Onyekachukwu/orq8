import { AesGcmCipher, conflict, notFound, validation } from '@orq8/core';
import {
  rotateProviderKeyBody,
  saveProviderKeyBody,
  type ProviderKeyResponse,
} from '@orq8/domain';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as providersService from '../services/providers.js';
import type { AppDeps } from '../types.js';
import { maskSecret, parseSecret, serializeSecret } from '@orq8/core';

// docs/23 — provider keys: encrypted at rest (AES-256-GCM, key_kid per row),
// masked in every response, full key only ever in request bodies, access audited.
// org_id always comes from the session (docs/35.1), never the client.

// Known default API bases for the seeded catalog (docs/23.1); per-key/endpoint
// base_url overrides always win. Ollama is local (no key).
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

function toKeyResponse(row: {
  key: {
    id: string;
    name: string | null;
    authType: string;
    mask: string;
    baseUrl: string | null;
    allowedModels: unknown;
    enabled: boolean;
    status: string;
    lastTestedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  };
  provider: { slug: string; name: string; kind: string };
}): ProviderKeyResponse {
  return {
    id: row.key.id,
    provider: row.provider.slug,
    provider_name: row.provider.name,
    kind: row.provider.kind,
    name: row.key.name,
    auth_type: row.key.authType === 'endpoint' ? 'endpoint' : 'api_key',
    mask: row.key.mask,
    base_url: row.key.baseUrl,
    allowed_models: Array.isArray(row.key.allowedModels) ? (row.key.allowedModels as string[]) : [],
    enabled: row.key.enabled,
    status: row.key.status,
    last_tested_at: row.key.lastTestedAt?.toISOString() ?? null,
    last_used_at: row.key.lastUsedAt?.toISOString() ?? null,
    created_at: row.key.createdAt.toISOString(),
  };
}

export function registerProviderRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, logger, config } = deps;
  const cipher = new AesGcmCipher(config.ENCRYPTION_KEY);

  // docs/23.3 — catalog with per-org connected status (never key material)
  app.get('/v1/providers', async (request) => {
    const ctx = await requireAuth(request, deps);
    const [catalog, activeIds] = await Promise.all([
      providersService.listProviders(db),
      providersService.listActiveKeyIdsByOrg(db, ctx.orgId),
    ]);
    return {
      data: catalog.map((p) => ({
        slug: p.slug,
        name: p.name,
        kind: p.kind,
        base_url: p.baseUrl,
        doc_url: p.docUrl,
        default_models: Array.isArray(p.defaultModels) ? (p.defaultModels as string[]) : [],
        connected: activeIds.has(p.id),
      })),
    };
  });

  // docs/23.4.1 — add a key: validate → encrypt → mask → store + audit
  app.post('/v1/providers/keys', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = saveProviderKeyBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const { provider_slug, name, auth_type, api_key, base_url, allowed_models, monthly_spend_ceiling } =
      parsed.data;
    const provider = await providersService.findProviderBySlug(db, provider_slug);
    if (!provider) throw notFound(`Unknown provider: ${provider_slug}`);
    if (provider.kind === 'local') {
      throw conflict('Local providers (e.g. Ollama) need no key');
    }

    const secret = auth_type === 'endpoint' ? (api_key as string) : (api_key as string);
    const { secret: encrypted, kid } = cipher.encrypt(secret, config.ENCRYPTION_KEY_KID);

    const key = await providersService.createKey(db, {
      orgId: ctx.orgId,
      providerId: provider.id,
      name: name ?? null,
      authType: auth_type,
      keyEncrypted: serializeSecret(encrypted),
      keyKid: kid,
      mask: maskSecret(secret),
      baseUrl: auth_type === 'endpoint' ? (base_url ?? null) : null,
      allowedModels: allowed_models ?? [],
      monthlySpendCeiling: monthly_spend_ceiling ?? null,
      enabled: true,
      status: 'active',
    });

    await providersService.recordSecretAccess(db, {
      orgId: ctx.orgId,
      keyId: key.id,
      action: 'created',
      actorType: 'user',
      actorId: ctx.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'provider.key_saved',
      outcome: 'success',
    });

    reply.code(201);
    return {
      data: toKeyResponse({
        key: {
          id: key.id,
          name: key.name,
          authType: key.authType,
          mask: key.mask,
          baseUrl: key.baseUrl,
          allowedModels: key.allowedModels,
          enabled: key.enabled,
          status: key.status,
          lastTestedAt: key.lastTestedAt,
          lastUsedAt: key.lastUsedAt,
          createdAt: key.createdAt,
        },
        provider: { slug: provider.slug, name: provider.name, kind: provider.kind },
      }),
    };
  });

  // docs/23.3 — list org keys (masked only; no decrypt, no secret ledger entry)
  app.get('/v1/providers/keys', async (request) => {
    const ctx = await requireAuth(request, deps);
    const rows = await providersService.listKeysByOrg(db, ctx.orgId);
    return { data: rows.map(toKeyResponse) };
  });

  // Single key (masked)
  app.get('/v1/providers/keys/:id', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const row = await providersService.findKeyById(db, id, ctx.orgId);
    if (!row) throw notFound('Provider key not found');
    return { data: toKeyResponse(row) };
  });

  // docs/23.4.4 — rotate: new key replaces the encrypted payload in place
  app.post('/v1/providers/keys/:id/rotate', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };
    const parsed = rotateProviderKeyBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const row = await providersService.findKeyById(db, id, ctx.orgId);
    if (!row) throw notFound('Provider key not found');
    if (row.key.status === 'revoked') throw conflict('Revoked keys cannot be rotated');

    const { secret: encrypted, kid } = cipher.encrypt(parsed.data.new_api_key, config.ENCRYPTION_KEY_KID);
    const updated = await providersService.replaceKeyPayload(db, id, ctx.orgId, {
      keyEncrypted: serializeSecret(encrypted),
      keyKid: kid,
      mask: maskSecret(parsed.data.new_api_key),
    });
    if (!updated) throw notFound('Provider key not found');

    await providersService.recordSecretAccess(db, {
      orgId: ctx.orgId,
      keyId: id,
      action: 'rotated',
      actorType: 'user',
      actorId: ctx.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'provider.key_rotated',
      outcome: 'success',
    });

    return { data: toKeyResponse({ ...row, key: { ...row.key, ...updated } }) };
  });

  // docs/23.4.5 — revoke: immediate; row stays for audit, no key material exposed
  app.post('/v1/providers/keys/:id/revoke', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };

    const row = await providersService.findKeyById(db, id, ctx.orgId);
    if (!row) throw notFound('Provider key not found');

    const revoked = await providersService.revokeKey(db, id, ctx.orgId);
    if (!revoked) throw notFound('Provider key not found');

    await providersService.recordSecretAccess(db, {
      orgId: ctx.orgId,
      keyId: id,
      action: 'revoked',
      actorType: 'user',
      actorId: ctx.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'provider.key_revoked',
      outcome: 'success',
    });

    return { data: toKeyResponse({ ...row, key: { ...row.key, ...revoked } }) };
  });

  // docs/23.4.3 — test connection: decrypt once, probe the provider, record the read
  app.post('/v1/providers/keys/:id/test', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { id } = request.params as { id: string };

    const row = await providersService.findKeyById(db, id, ctx.orgId);
    if (!row) throw notFound('Provider key not found');
    if (row.key.status === 'revoked') throw conflict('Revoked keys cannot be tested');

    let plaintext: string;
    try {
      plaintext = cipher.decrypt(parseSecret(row.key.keyEncrypted));
    } catch (err) {
      logger.error({ err, keyId: id }, 'provider test: decrypt failed');
      throw conflict('Key payload failed to decrypt (master key changed?)');
    }

    await providersService.recordSecretAccess(db, {
      orgId: ctx.orgId,
      keyId: id,
      action: 'tested',
      actorType: 'user',
      actorId: ctx.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    const base =
      row.key.baseUrl ?? row.provider.baseUrl ?? DEFAULT_BASE_URLS[row.provider.slug] ?? null;
    const result = await probeProvider(row.provider, plaintext, base, logger);
    await providersService.markKeyTested(db, id, ctx.orgId);
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'provider.key_tested',
      outcome: result.ok ? 'success' : 'failure',
    });

    return {
      data: {
        ok: result.ok,
        message: result.message,
        provider: row.provider.slug,
        tested_at: new Date().toISOString(),
      },
    };
  });
}

interface ProbeResult {
  ok: boolean;
  message: string;
}

async function probeProvider(
  provider: { slug: string; kind: string; name: string },
  apiKey: string,
  base: string | null,
  logger: AppDeps['logger'],
): Promise<ProbeResult> {
  if (provider.kind === 'local' || provider.slug === 'ollama') {
    const url = `${base ?? 'http://localhost:11434'}/api/tags`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok
        ? { ok: true, message: `Connected to ${provider.name} (local)` }
        : { ok: false, message: `Local provider responded ${res.status}` };
    } catch (err) {
      logger.warn({ err, url }, 'provider test: local probe failed');
      return { ok: false, message: 'Local provider unreachable — is Ollama running?' };
    }
  }

  if (!base) {
    return { ok: false, message: 'No API base URL configured for this provider' };
  }
  const url = `${base.replace(/\/$/, '')}/models`;
  const headers: Record<string, string> =
    provider.slug === 'anthropic'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` };
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) return { ok: true, message: `Connected — ${provider.name} accepted the key` };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `${provider.name} rejected the key (${res.status})` };
    }
    return { ok: false, message: `${provider.name} responded ${res.status}` };
  } catch (err) {
    logger.warn({ err, url }, 'provider test: probe failed');
    return { ok: false, message: `Could not reach ${provider.name} (${url})` };
  }
}
