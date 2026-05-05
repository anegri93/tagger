import { z } from 'zod';

export const reprocessRequestSchema = z.object({
  truncate_first: z.boolean().optional(),
  file: z.string().min(1).max(200).optional(),
});

export type ReprocessRequest = z.infer<typeof reprocessRequestSchema>;
