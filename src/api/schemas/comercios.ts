import { z } from 'zod';

export const listComerciosSchema = z.object({
  categoria: z.string().min(1).max(30).optional(),
  q: z.string().min(1).max(100).optional(),
  requiere_revision: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateComercioSchema = z.object({
  categoria_slug: z.string().min(1).max(30).optional(),
  requiere_revision: z.boolean().optional(),
});

export type ListComerciosQuery = z.infer<typeof listComerciosSchema>;
export type UpdateComercioRequest = z.infer<typeof updateComercioSchema>;
