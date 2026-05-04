import { and, eq } from 'drizzle-orm';
import { reglasRegex } from '../schema/index.js';
import type { LoaderConfig } from './csv.js';

interface ReglaRow {
  patron: string;
  categoria_slug: string;
  prioridad: string;
  descripcion?: string;
}

interface ReglaInsert {
  patron: string;
  categoriaId: string;
  prioridad: number;
  descripcion: string | null;
  activo: boolean;
}

const DATA: ReglaRow[] = [
  // Supermercados
  { patron: '\\bBIGGIE\\b', categoria_slug: 'supermercado', prioridad: '10', descripcion: 'Biggie' },
  { patron: '\\bSUPER\\s*SEIS\\b', categoria_slug: 'supermercado', prioridad: '10', descripcion: 'Super Seis' },
  { patron: '\\bSUPERSEIS\\b', categoria_slug: 'supermercado', prioridad: '10', descripcion: 'Superseis' },
  { patron: '\\bSTOCK\\b', categoria_slug: 'supermercado', prioridad: '20', descripcion: 'Stock' },
  { patron: '\\bAREA\\s*UNO\\b', categoria_slug: 'supermercado', prioridad: '20', descripcion: 'Area Uno' },
  { patron: '\\bSALEMMA\\b', categoria_slug: 'supermercado', prioridad: '20', descripcion: 'Salemma' },
  { patron: '\\bCASA\\s*RICA\\b', categoria_slug: 'supermercado', prioridad: '20', descripcion: 'Casa Rica' },
  { patron: '\\bLOS\\s*JARDINES\\b', categoria_slug: 'supermercado', prioridad: '30', descripcion: 'Los Jardines' },
  // Combustible
  { patron: '\\bCOPETROL\\b', categoria_slug: 'combustible', prioridad: '10', descripcion: 'Copetrol' },
  { patron: '\\bSHELL\\b', categoria_slug: 'combustible', prioridad: '10', descripcion: 'Shell' },
  { patron: '\\bPETROBRAS\\b', categoria_slug: 'combustible', prioridad: '10', descripcion: 'Petrobras' },
  { patron: '\\bPUMA\\s*ENERGY\\b', categoria_slug: 'combustible', prioridad: '10', descripcion: 'Puma Energy' },
  { patron: '\\bMONTE\\s*ALTO\\b', categoria_slug: 'combustible', prioridad: '20', descripcion: 'Monte Alto' },
  { patron: '\\bBARCOS\\s*Y\\s*ROD', categoria_slug: 'combustible', prioridad: '20', descripcion: 'Barcos y Rodados' },
  // Farmacia
  { patron: '\\bPUNTO\\s*FARMA\\b', categoria_slug: 'farmacia', prioridad: '10', descripcion: 'Punto Farma' },
  { patron: '\\bFARMA\\s*CENTER\\b', categoria_slug: 'farmacia', prioridad: '10', descripcion: 'Farmacenter' },
  { patron: '\\bCATEDRAL\\b.*FARMA', categoria_slug: 'farmacia', prioridad: '30', descripcion: 'Catedral farmacia' },
  // Restaurante
  { patron: '\\bMC\\s*DONALDS?\\b', categoria_slug: 'restaurante', prioridad: '10', descripcion: 'McDonalds' },
  { patron: '\\bBURGER\\s*KING\\b', categoria_slug: 'restaurante', prioridad: '10', descripcion: 'Burger King' },
  { patron: '\\bPIZZA\\s*HUT\\b', categoria_slug: 'restaurante', prioridad: '10', descripcion: 'Pizza Hut' },
  { patron: '\\bKFC\\b', categoria_slug: 'restaurante', prioridad: '10', descripcion: 'KFC' },
  // Servicios
  { patron: '\\bANDE\\b', categoria_slug: 'servicios', prioridad: '10', descripcion: 'ANDE energía' },
  { patron: '\\bESSAP\\b', categoria_slug: 'servicios', prioridad: '10', descripcion: 'ESSAP agua' },
  { patron: '\\bCOPACO\\b', categoria_slug: 'servicios', prioridad: '10', descripcion: 'Copaco' },
  { patron: '\\bTIGO\\b', categoria_slug: 'servicios', prioridad: '10', descripcion: 'Tigo' },
  { patron: '\\bPERSONAL\\b', categoria_slug: 'servicios', prioridad: '20', descripcion: 'Personal' },
  { patron: '\\bCLARO\\b', categoria_slug: 'servicios', prioridad: '20', descripcion: 'Claro' },
  // Transporte
  { patron: '\\bMUV\\b', categoria_slug: 'transporte', prioridad: '10', descripcion: 'MUV' },
  { patron: '\\bUBER\\b', categoria_slug: 'transporte', prioridad: '10', descripcion: 'Uber' },
  { patron: '\\bBOLT\\b', categoria_slug: 'transporte', prioridad: '10', descripcion: 'Bolt' },
  // Entretenimiento
  { patron: '\\bNETFLIX\\b', categoria_slug: 'entretenimiento', prioridad: '10', descripcion: 'Netflix' },
  { patron: '\\bSPOTIFY\\b', categoria_slug: 'entretenimiento', prioridad: '10', descripcion: 'Spotify' },
  { patron: '\\bDISNEY', categoria_slug: 'entretenimiento', prioridad: '10', descripcion: 'Disney+' },
  // Transferencias P2P (prioridad alta pa que dispare antes)
  { patron: '^MANGO\\b', categoria_slug: 'transferencia', prioridad: '5', descripcion: 'Mango P2P' },
  // Azar y apuestas
  { patron: '\\b(AZAR|SLOTS?|TRAGAMONEDAS?|CASINO|GAMING|APUESTAS?|BETSAT|GIRO\\s?WIN|SOLBET|PGP|UPAY|EGLOBALT)\\b', categoria_slug: 'azar', prioridad: '10', descripcion: 'Juegos de azar' },
];

export const reglasLoaderConfig: LoaderConfig<ReglaRow & Record<string, string>, ReglaInsert> = {
  table: reglasRegex,
  tableName: 'reglas_regex',
  data: DATA as never,
  mapRow(row, ctx) {
    const categoriaId = ctx.resolveCategoria(row.categoria_slug);
    if (!categoriaId) {
      console.warn(`[reglas] categoría '${row.categoria_slug}' inexistente, skip ${row.patron}`);
      return null;
    }
    return {
      patron: row.patron,
      categoriaId,
      prioridad: Number(row.prioridad) || 100,
      descripcion: row.descripcion ?? null,
      activo: true,
    };
  },
  // Idempotencia por (patron, categoriaId)
  upsert: null,
  async customInsert(row, ctx) {
    const existing = await ctx.db
      .select({ id: reglasRegex.id })
      .from(reglasRegex)
      .where(and(eq(reglasRegex.patron, row.patron), eq(reglasRegex.categoriaId, row.categoriaId)))
      .limit(1);
    if (existing.length === 0) {
      await ctx.db.insert(reglasRegex).values(row);
      return 'inserted';
    }
    await ctx.db
      .update(reglasRegex)
      .set({
        prioridad: row.prioridad,
        descripcion: row.descripcion,
        activo: row.activo,
        updatedAt: new Date(),
      })
      .where(eq(reglasRegex.id, existing[0]!.id));
    return 'updated';
  },
};
