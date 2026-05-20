import { z } from 'zod';

export const categorizarRequestSchema = z
  .object({
    descripcion: z.string().min(1).max(500).optional(),
    nombre_comercio: z.string().min(1).max(200).optional(),
    nombre_bancard: z.string().min(1).max(200).optional(),
    mcc: z.preprocess(
      (v) => {
        if (typeof v !== 'string') return v;
        const t = v.trim();
        if (t === '' || /^(sin\s*rubro|null|na|n\/a)$/i.test(t)) return undefined;
        return t;
      },
      z
        .string()
        .regex(/^\d{2,4}$/)
        .optional(),
    ),
    bancard_id: z.string().min(1).max(100).optional(),
    codigo_comercio: z.string().min(1).max(50).optional(),
    monto: z.number().finite().optional(),
    origen: z.string().min(1).max(50).optional(),
    batch_id: z.string().min(1).max(100).optional(),
    bypass_catalogo: z.boolean().optional(),
    /**
     * Categoría predefinida por el usuario (UUID). Si está presente, se SALTEA
     * el pipeline y el movimiento se guarda con esta categoría como manual
     * (fuente='manual', confianza=1.0). Útil para gastos creados manualmente
     * en la app donde el usuario ya elige la categoría al cargar.
     */
    categoria_id: z.string().uuid().optional(),
    /**
     * Si true (y hay `categoria_id` + `origen`), guarda regla user-scope para
     * que próximos movs con el mismo nombre devuelvan esta categoría automático.
     * Si false (default cuando hay categoria_id), sólo se aplica a este mov.
     */
    aprender: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.descripcion ?? v.nombre_comercio ?? v.nombre_bancard ?? v.mcc), {
    message: 'al menos uno de descripcion, nombre_comercio, nombre_bancard o mcc es requerido',
  });

export type CategorizarRequest = z.infer<typeof categorizarRequestSchema>;

export const categorizarResponseSchema = z.object({
  movimiento_id: z.string().uuid(),
  categoria_id: z.string().uuid().nullable(),
  fuente: z.enum(['regex', 'bancard', 'nombre', 'mcc', 'ia', 'manual']).nullable(),
  confianza: z.number().min(0).max(1).nullable(),
  requiere_revision: z.boolean(),
});

export type CategorizarResponse = z.infer<typeof categorizarResponseSchema>;
