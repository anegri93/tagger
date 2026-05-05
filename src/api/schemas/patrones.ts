import { z } from 'zod';

export const patronTipoEnum = z.enum(['regex', 'literal', 'prefijo', 'contiene']);

export const createPatronSchema = z.object({
  tipo: patronTipoEnum,
  valor: z.string().min(1).max(500),
  categoria_slug: z.string().min(1).max(30),
  prioridad: z.number().int().min(0).max(10000).default(100),
  descripcion: z.string().max(200).optional(),
});

export const updatePatronSchema = z.object({
  valor: z.string().min(1).max(500).optional(),
  prioridad: z.number().int().min(0).max(10000).optional(),
  descripcion: z.string().max(200).nullable().optional(),
  activo: z.boolean().optional(),
  categoria_slug: z.string().min(1).max(30).optional(),
});

export const testPatronSchema = z.object({
  tipo: patronTipoEnum,
  valor: z.string().min(1).max(500),
  texto: z.string().min(1).max(500),
});

export type CreatePatronRequest = z.infer<typeof createPatronSchema>;
export type UpdatePatronRequest = z.infer<typeof updatePatronSchema>;
export type TestPatronRequest = z.infer<typeof testPatronSchema>;
