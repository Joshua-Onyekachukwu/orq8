import { z } from 'zod';
import { emailSchema } from './auth.js';

// Public waitlist signup (landing funnel — no auth, docs/00 GTM).
export const waitlistBody = z.object({
  email: emailSchema,
  source: z.string().trim().max(80).optional(),
});
export type WaitlistBody = z.infer<typeof waitlistBody>;
