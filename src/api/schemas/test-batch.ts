import { z } from 'zod';

export const startBatchRequestSchema = z.object({
  batch_id: z.string().min(1).max(100),
  files: z.array(z.string().min(1).max(200)).optional(),
  limit: z.number().int().positive().optional(),
  concurrency: z.number().int().min(1).max(100).optional(),
  bypass_catalogo: z.boolean().optional(),
});

export type StartBatchRequest = z.infer<typeof startBatchRequestSchema>;

export const stopBatchRequestSchema = z.object({
  batch_id: z.string().min(1).max(100),
});

export type StopBatchRequest = z.infer<typeof stopBatchRequestSchema>;
