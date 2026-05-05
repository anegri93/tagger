import { z } from 'zod';

const slugSchema = z
  .string()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9_]+$/, 'slug debe ser [a-z0-9_]+');

export const createCategoriaSchema = z.object({
  slug: slugSchema,
  nombre: z.string().min(1).max(100),
  descripcion: z.string().max(500).optional(),
});

export const updateCategoriaSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  descripcion: z.string().max(500).nullable().optional(),
});

export type CreateCategoriaRequest = z.infer<typeof createCategoriaSchema>;
export type UpdateCategoriaRequest = z.infer<typeof updateCategoriaSchema>;
