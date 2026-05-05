import { z } from 'zod';

export const createReglaSchema = z.object({
  patron: z.string().min(1).max(500),
  categoria_slug: z.string().min(1).max(30),
  prioridad: z.number().int().min(0).max(10000).default(100),
  descripcion: z.string().max(200).optional(),
});

export const updateReglaSchema = z.object({
  patron: z.string().min(1).max(500).optional(),
  prioridad: z.number().int().min(0).max(10000).optional(),
  descripcion: z.string().max(200).nullable().optional(),
  activo: z.boolean().optional(),
  categoria_slug: z.string().min(1).max(30).optional(),
});

export const testReglaSchema = z.object({
  patron: z.string().min(1).max(500),
  texto: z.string().min(1).max(500),
});

export type CreateReglaRequest = z.infer<typeof createReglaSchema>;
export type UpdateReglaRequest = z.infer<typeof updateReglaSchema>;
export type TestReglaRequest = z.infer<typeof testReglaSchema>;
