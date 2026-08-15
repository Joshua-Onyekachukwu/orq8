import { z } from 'zod';

// docs/23 — provider configuration contracts. Full keys are request-only:
// they appear in save/rotate bodies and never in any response.

export const providerAuthType = z.enum(['api_key', 'endpoint']);
export type ProviderAuthType = z.infer<typeof providerAuthType>;

export const saveProviderKeyBody = z
  .object({
    provider_slug: z.string().trim().min(1).max(80),
    name: z.string().trim().max(120).optional(),
    auth_type: providerAuthType.default('api_key'),
    // api_key: for byok providers. base_url: required when auth_type = endpoint (BYO-endpoint).
    api_key: z.string().trim().min(4).max(4096).optional(),
    base_url: z.string().trim().url().max(512).optional(),
    allowed_models: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
    monthly_spend_ceiling: z.number().int().nonnegative().max(10_000_000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.auth_type === 'endpoint' && !v.base_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['base_url'], message: 'base_url is required for endpoint auth' });
    }
    if (v.auth_type === 'api_key' && !v.api_key) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['api_key'], message: 'api_key is required for api_key auth' });
    }
  });
export type SaveProviderKeyBody = z.infer<typeof saveProviderKeyBody>;

export const rotateProviderKeyBody = z.object({
  new_api_key: z.string().trim().min(4).max(4096),
});
export type RotateProviderKeyBody = z.infer<typeof rotateProviderKeyBody>;

export const providerKeyResponse = z.object({
  id: z.string(),
  provider: z.string(), // slug
  provider_name: z.string(),
  kind: z.string(),
  name: z.string().nullable(),
  auth_type: providerAuthType,
  mask: z.string(), // display-only; full key never in responses
  base_url: z.string().nullable(),
  allowed_models: z.array(z.string()),
  enabled: z.boolean(),
  status: z.string(),
  last_tested_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  created_at: z.string(),
});
export type ProviderKeyResponse = z.infer<typeof providerKeyResponse>;

export const providerCatalogResponse = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  base_url: z.string().nullable(),
  doc_url: z.string().nullable(),
  default_models: z.array(z.string()),
  connected: z.boolean(), // org has at least one active key for this provider
});
export type ProviderCatalogResponse = z.infer<typeof providerCatalogResponse>;
