import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { CapasSincrono } from '../../pipeline/categorizar.js';
import { ejecutarCascada } from '../../pipeline/categorizar.js';
import { normalize } from '../../domain/normalize.js';

interface ImportStats {
  total: number;
  procesados: number;
  insertados: number;
  actualizados: number;
  con_categoria: number;
  sin_categoria: number;
  errores: number;
  ultimo_error?: string;
}

interface ImportState {
  importId: string;
  startedAt: string;
  finishedAt: string | null;
  stats: ImportStats;
  estado: 'running' | 'done' | 'error';
  correrCascada: boolean;
  error?: string;
}

let current: ImportState | null = null;

function nuevoId(): string {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const rowSchema = z.object({
  nombre: z.string().min(1).max(500),
  bancard_id: z.string().max(100).optional().nullable(),
  codigo_comercio: z.string().max(50).optional().nullable(),
  mcc: z.string().max(10).optional().nullable(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(100000),
  correr_cascada: z.boolean().default(false),
});

async function getFallbackCategoriaId(db: Db): Promise<string> {
  const r = await db.execute(sql`SELECT id FROM categorias WHERE slug = 'otros' LIMIT 1`);
  if (r.rows.length === 0) throw new Error('falta categoría "otros" como fallback');
  return (r.rows[0] as { id: string }).id;
}

function cleanMcc(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || /^(sin\s*rubro|null|na|n\/a)$/i.test(t)) return null;
  if (!/^\d{2,4}$/.test(t)) return null;
  return t;
}

async function ejecutarImport(
  db: Db,
  capas: CapasSincrono,
  rows: z.infer<typeof rowSchema>[],
  correrCascada: boolean,
): Promise<void> {
  if (!current) return;
  current.stats.total = rows.length;
  const fallbackId = await getFallbackCategoriaId(db);

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    for (const r of batch) {
      try {
        const nombre = r.nombre.trim();
        const nombreNorm = normalize(nombre);
        const mcc = cleanMcc(r.mcc);
        const bancardId = r.bancard_id?.trim() || null;
        const codigo = r.codigo_comercio?.trim() || null;

        let categoriaId = fallbackId;
        let fuente: string | null = null;
        let confianza: string | null = null;
        let evidencia: unknown = null;
        let revision = false;

        if (correrCascada) {
          const result = await ejecutarCascada(
            { descripcion: nombre, mcc: mcc ?? undefined },
            capas,
            { bypassCatalogo: true },
          );
          if (result.resultado) {
            categoriaId = result.resultado.categoriaId;
            fuente = result.resultado.fuente;
            confianza = result.resultado.confianza != null ? String(result.resultado.confianza) : null;
            evidencia = result.resultado.evidencia;
            revision = (result.resultado.confianza ?? 0) < 0.7;
            current.stats.con_categoria++;
          } else {
            // sin categoría — usar fallback con revision
            fuente = null;
            revision = true;
            current.stats.sin_categoria++;
          }
        } else {
          revision = true;
          current.stats.sin_categoria++;
        }

        const ins = await db.execute(sql`
          INSERT INTO comercios_catalogo
            (nombre, nombre_normalizado, bancard_id, codigo_comercio, mcc, mcc_original,
             categoria_id, fuente_categoria, confianza, evidencia, requiere_revision)
          VALUES
            (${nombre}, ${nombreNorm}, ${bancardId}, ${codigo}, ${mcc}, ${mcc},
             ${categoriaId}, ${fuente}::fuente_categoria, ${confianza}, ${evidencia ? JSON.stringify(evidencia) : null}::jsonb, ${revision})
          ON CONFLICT (bancard_id, codigo_comercio) WHERE bancard_id IS NOT NULL
          DO UPDATE SET
            nombre = EXCLUDED.nombre,
            nombre_normalizado = EXCLUDED.nombre_normalizado,
            mcc = EXCLUDED.mcc,
            mcc_original = EXCLUDED.mcc_original,
            categoria_id = EXCLUDED.categoria_id,
            fuente_categoria = EXCLUDED.fuente_categoria,
            confianza = EXCLUDED.confianza,
            evidencia = EXCLUDED.evidencia,
            requiere_revision = EXCLUDED.requiere_revision,
            updated_at = now()
          RETURNING (xmax = 0) AS inserted
        `);
        const inserted = (ins.rows[0] as { inserted: boolean } | undefined)?.inserted ?? true;
        if (inserted) current.stats.insertados++;
        else current.stats.actualizados++;
      } catch (err) {
        current.stats.errores++;
        current.stats.ultimo_error = err instanceof Error ? err.message : String(err);
      }
      current.stats.procesados++;
    }
  }
}

export const importarCatalogoRoute =
  (db: Db, capas: CapasSincrono): FastifyPluginAsync =>
  async (app) => {
    app.post('/catalogo/importar', async (req, reply) => {
      if (current?.estado === 'running') {
        return reply.code(409).send({ error: 'import_en_progreso', import_id: current.importId });
      }
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.flatten() });
      }
      const importId = nuevoId();
      current = {
        importId,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        stats: {
          total: parsed.data.rows.length,
          procesados: 0,
          insertados: 0,
          actualizados: 0,
          con_categoria: 0,
          sin_categoria: 0,
          errores: 0,
        },
        estado: 'running',
        correrCascada: parsed.data.correr_cascada,
      };
      void ejecutarImport(db, capas, parsed.data.rows, parsed.data.correr_cascada)
        .then(() => {
          if (current) {
            current.estado = 'done';
            current.finishedAt = new Date().toISOString();
          }
        })
        .catch((err: unknown) => {
          if (current) {
            current.estado = 'error';
            current.error = err instanceof Error ? err.message : String(err);
            current.finishedAt = new Date().toISOString();
          }
        });
      return reply.code(202).send({ import_id: importId });
    });

    app.get('/catalogo/importar/status', async (_req, reply) => {
      return reply.send({ run: current });
    });
  };
