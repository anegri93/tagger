import { z } from 'zod';

export const createMccSchema = z.object({
  cod_mcc: z.string().regex(/^\d{2,4}$/, 'cod_mcc 2-4 dígitos'),
  descripcion: z.string().min(1).max(200),
  categoria_slug: z.string().min(1).max(30).optional(),
  ambiguo: z.boolean().optional(),
});

export const updateMccSchema = z.object({
  descripcion: z.string().min(1).max(200).optional(),
  categoria_slug: z.string().min(1).max(30).nullable().optional(),
  ambiguo: z.boolean().optional(),
});

export type CreateMccRequest = z.infer<typeof createMccSchema>;
export type UpdateMccRequest = z.infer<typeof updateMccSchema>;
