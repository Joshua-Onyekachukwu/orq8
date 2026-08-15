import { z } from 'zod';
import { emailSchema } from './auth.js';

// Public waitlist signup (landing funnel — no auth, docs/00 GTM).
// name/role feed the design-partner pipeline (marketing/design_partner_application.md §2).
export const waitlistRole = z.enum(['just_me', 'me_1_2', 'small_team']);

export const waitlistBody = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120).optional(),
  role: waitlistRole.optional(),
  source: z.string().trim().max(80).optional(),
});
export type WaitlistBody = z.infer<typeof waitlistBody>;
