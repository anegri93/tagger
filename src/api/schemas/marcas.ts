import { z } from 'zod';

export const createMarcaSchema = z.object({
  marca: z.string().min(1).max(100),
  categoria_slug: z.string().min(1).max(30),
  descripcion: z.string().max(200).optional(),
});

export const updateMarcaSchema = z.object({
  marca: z.string().min(1).max(100).optional(),
  categoria_slug: z.string().min(1).max(30).optional(),
  descripcion: z.string().max(200).nullable().optional(),
});

export type CreateMarcaRequest = z.infer<typeof createMarcaSchema>;
export type UpdateMarcaRequest = z.infer<typeof updateMarcaSchema>;
