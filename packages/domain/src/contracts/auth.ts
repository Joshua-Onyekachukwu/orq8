import { z } from 'zod';

// docs/35.3 Auth contracts
export const emailSchema = z.string().trim().email().max(255);
export const passwordSchema = z.string().min(8).max(128);

export const registerBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
  org_name: z.string().trim().min(1).max(120),
});
export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBody>;

export const membershipRole = z.enum(['owner', 'admin', 'member', 'viewer']);
export type MembershipRole = z.infer<typeof membershipRole>;

export const sessionResponse = z.object({
  token: z.string(),
  expires_at: z.string(), // ISO-8601
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  org: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    plan: z.string(),
    role: membershipRole,
  }),
});
export type SessionResponse = z.infer<typeof sessionResponse>;

export const meResponse = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  memberships: z.array(
    z.object({
      org: z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        plan: z.string(),
      }),
      role: membershipRole,
    }),
  ),
  active_org_id: z.string().nullable(),
});
export type MeResponse = z.infer<typeof meResponse>;
