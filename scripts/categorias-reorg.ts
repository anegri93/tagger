// Reorganización idempotente de categorías.
//
// Lee un plan JSON, valida, muestra impacto, y aplica con --apply.
// Crea aliases automáticos al renombrar para preservar backwards-compat.
// Fusiona reubicando FKs (movimientos, reglas, mcc_*, marcas, correcciones)
// + soft-delete del origen + marca reemplazada_por.
// Borra solo si la categoría no tiene referencias (las "vacías").
//
// Uso:
//   pnpm tsx scripts/categorias-reorg.ts --plan=data/reorg-plan.json [--apply]
//
// Formato del plan:
// {
//   "renombrar": [
//     { "identificador": "cafeteria", "nuevo_slug": "cafeteria_pan", "nuevo_nombre": "Cafetería y panadería" }
//   ],
//   "fusionar": [
//     { "origen": ["mascotas"], "destino": "otros", "motivo": "1 sola entrada" }
//   ],
//   "borrar": [
//     { "identificador": "religioso", "motivo": "sin uso" }
//   ]
// }

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { resolverIdentificador } from '../src/db/repos/categorias.js';

interface Plan {
  renombrar?: Array<{
    identificador: string;
    nuevo_slug?: string;
    nuevo_nombre?: string;
    motivo?: string;
  }>;
  fusionar?: Array<{
    origen: string[];
    destino: string;
    motivo?: string;
  }>;
  borrar?: Array<{
    identificador: string;
    motivo?: string;
  }>;
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PLAN_PATH = args.find((a) => a.startsWith('--plan='))?.split('=')[1] ?? 'data/reorg-plan.json';

function log(...xs: unknown[]): void {
  console.log(...xs);
}

function fail(msg: string): never {
  console.error('ERROR:', msg);
  process.exit(1);
}

const planRaw = readFileSync(PLAN_PATH, 'utf8');
const plan = JSON.parse(planRaw) as Plan;

log(`Plan: ${PLAN_PATH}`);
log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
log('');

// Validación previa: resolver todos los identificadores
type ResolvedRename = {
  catId: string;
  slugActual: string;
  nuevoSlug?: string;
  nuevoNombre?: string;
  motivo?: string;
};
type ResolvedMerge = {
  origenes: Array<{ id: string; slug: string }>;
  destinoId: string;
  destinoSlug: string;
  motivo?: string;
};
type ResolvedDelete = {
  catId: string;
  slug: string;
  motivo?: string;
};

const renames: ResolvedRename[] = [];
const merges: ResolvedMerge[] = [];
const deletes: ResolvedDelete[] = [];

for (const r of plan.renombrar ?? []) {
  const target = await resolverIdentificador(db, r.identificador);
  if (!target) fail(`renombrar: identificador no existe: ${r.identificador}`);
  const entry: ResolvedRename = {
    catId: target.id,
    slugActual: target.slug,
  };
  if (r.nuevo_slug !== undefined) entry.nuevoSlug = r.nuevo_slug;
  if (r.nuevo_nombre !== undefined) entry.nuevoNombre = r.nuevo_nombre;
  if (r.motivo !== undefined) entry.motivo = r.motivo;
  renames.push(entry);
}

for (const m of plan.fusionar ?? []) {
  const destino = await resolverIdentificador(db, m.destino);
  if (!destino) fail(`fusionar: destino no existe: ${m.destino}`);
  const origenes: Array<{ id: string; slug: string }> = [];
  for (const o of m.origen) {
    const target = await resolverIdentificador(db, o);
    if (!target) fail(`fusionar: origen no existe: ${o}`);
    if (target.id === destino.id)
      fail(`fusionar: origen == destino (${o}). No tiene sentido.`);
    origenes.push({ id: target.id, slug: target.slug });
  }
  const entry: ResolvedMerge = {
    origenes,
    destinoId: destino.id,
    destinoSlug: destino.slug,
  };
  if (m.motivo !== undefined) entry.motivo = m.motivo;
  merges.push(entry);
}

for (const d of plan.borrar ?? []) {
  const target = await resolverIdentificador(db, d.identificador);
  if (!target) fail(`borrar: identificador no existe: ${d.identificador}`);
  const entry: ResolvedDelete = { catId: target.id, slug: target.slug };
  if (d.motivo !== undefined) entry.motivo = d.motivo;
  deletes.push(entry);
}

// Calcular usage para cada origen de merge + cada borrar
async function usageOf(catId: string): Promise<{
  movimientos: number;
  reglas: number;
  mccPorNombre: number;
  mccCatalogo: number;
  marcas: number;
  correcciones: number;
}> {
  const r = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM movimientos WHERE categoria_predicha_id = ${catId} OR categoria_confirmada_id = ${catId}) AS movimientos,
      (SELECT count(*)::int FROM reglas WHERE categoria_id = ${catId}) AS reglas,
      (SELECT count(*)::int FROM mcc_por_nombre WHERE categoria_id = ${catId}) AS mcc_por_nombre,
      (SELECT count(*)::int FROM mcc_catalogo WHERE categoria_id = ${catId}) AS mcc_catalogo,
      (SELECT count(*)::int FROM marcas_conocidas WHERE categoria_id = ${catId}) AS marcas,
      (SELECT count(*)::int FROM correcciones_usuario WHERE categoria_anterior_id = ${catId} OR categoria_nueva_id = ${catId}) AS correcciones
  `);
  const row = r.rows[0] as Record<string, number>;
  return {
    movimientos: Number(row.movimientos ?? 0),
    reglas: Number(row.reglas ?? 0),
    mccPorNombre: Number(row.mcc_por_nombre ?? 0),
    mccCatalogo: Number(row.mcc_catalogo ?? 0),
    marcas: Number(row.marcas ?? 0),
    correcciones: Number(row.correcciones ?? 0),
  };
}

// === Reporte impacto ===
if (renames.length > 0) {
  log('--- Renombrar ---');
  for (const r of renames) {
    const cambios: string[] = [];
    if (r.nuevoNombre) cambios.push(`nombre→"${r.nuevoNombre}"`);
    if (r.nuevoSlug && r.nuevoSlug !== r.slugActual)
      cambios.push(`slug ${r.slugActual}→${r.nuevoSlug} (crea alias)`);
    log(`  ${r.slugActual}: ${cambios.join(', ') || '(sin cambios)'}`);
  }
  log('');
}

if (merges.length > 0) {
  log('--- Fusionar ---');
  for (const m of merges) {
    let totalMovs = 0,
      totalReglas = 0,
      totalMccN = 0,
      totalMccC = 0,
      totalMarcas = 0,
      totalCorr = 0;
    for (const o of m.origenes) {
      const u = await usageOf(o.id);
      log(
        `  ${o.slug} → ${m.destinoSlug}: movs=${u.movimientos} reglas=${u.reglas} mcc_por_nombre=${u.mccPorNombre} mcc_cat=${u.mccCatalogo} marcas=${u.marcas} corr=${u.correcciones}`,
      );
      totalMovs += u.movimientos;
      totalReglas += u.reglas;
      totalMccN += u.mccPorNombre;
      totalMccC += u.mccCatalogo;
      totalMarcas += u.marcas;
      totalCorr += u.correcciones;
    }
    log(
      `    TOTAL a reubicar: movs=${totalMovs} reglas=${totalReglas} mcc_por_nombre=${totalMccN} mcc_cat=${totalMccC} marcas=${totalMarcas} corr=${totalCorr}`,
    );
  }
  log('');
}

if (deletes.length > 0) {
  log('--- Borrar (solo si usage=0) ---');
  for (const d of deletes) {
    const u = await usageOf(d.catId);
    const totalRefs =
      u.movimientos + u.reglas + u.mccPorNombre + u.mccCatalogo + u.marcas + u.correcciones;
    log(
      `  ${d.slug}: refs total=${totalRefs} ${totalRefs > 0 ? '⚠️  NO BORRABLE (mover/fusionar primero)' : '✓ borrable'}`,
    );
  }
  log('');
}

if (!APPLY) {
  log('--- DRY-RUN, sin cambios. Para aplicar: --apply ---');
  process.exit(0);
}

// === APPLY ===
log('▶ Aplicando cambios...\n');

// Renames
for (const r of renames) {
  const cambiaNombre = r.nuevoNombre !== undefined;
  const cambiaSlug = r.nuevoSlug !== undefined && r.nuevoSlug !== r.slugActual;
  if (!cambiaNombre && !cambiaSlug) {
    log(`  (skip) ${r.slugActual}: sin cambios`);
    continue;
  }
  if (cambiaNombre && cambiaSlug) {
    await db.execute(
      sql`UPDATE categorias SET nombre = ${r.nuevoNombre}, slug = ${r.nuevoSlug}, updated_at = now() WHERE id = ${r.catId}`,
    );
  } else if (cambiaNombre) {
    await db.execute(
      sql`UPDATE categorias SET nombre = ${r.nuevoNombre}, updated_at = now() WHERE id = ${r.catId}`,
    );
  } else if (cambiaSlug) {
    await db.execute(
      sql`UPDATE categorias SET slug = ${r.nuevoSlug}, updated_at = now() WHERE id = ${r.catId}`,
    );
  }
  if (cambiaSlug) {
    await db.execute(
      sql`INSERT INTO categorias_alias (slug_antiguo, categoria_id, motivo)
          VALUES (${r.slugActual}, ${r.catId}, ${r.motivo ?? 'rename'})
          ON CONFLICT (slug_antiguo) DO NOTHING`,
    );
  }
  log(`  ✓ renombrado: ${r.slugActual} → ${r.nuevoSlug ?? r.slugActual}`);
}

// Merges
for (const m of merges) {
  for (const o of m.origenes) {
    await db.execute(sql`UPDATE reglas SET categoria_id = ${m.destinoId} WHERE categoria_id = ${o.id}`);
    await db.execute(sql`UPDATE mcc_catalogo SET categoria_id = ${m.destinoId} WHERE categoria_id = ${o.id}`);
    await db.execute(sql`UPDATE mcc_por_nombre SET categoria_id = ${m.destinoId} WHERE categoria_id = ${o.id}`);
    await db.execute(sql`UPDATE marcas_conocidas SET categoria_id = ${m.destinoId} WHERE categoria_id = ${o.id}`);
    await db.execute(
      sql`UPDATE movimientos SET categoria_predicha_id = ${m.destinoId} WHERE categoria_predicha_id = ${o.id}`,
    );
    await db.execute(
      sql`UPDATE movimientos SET categoria_confirmada_id = ${m.destinoId} WHERE categoria_confirmada_id = ${o.id}`,
    );
    await db.execute(
      sql`UPDATE correcciones_usuario SET categoria_anterior_id = ${m.destinoId} WHERE categoria_anterior_id = ${o.id}`,
    );
    await db.execute(
      sql`UPDATE correcciones_usuario SET categoria_nueva_id = ${m.destinoId} WHERE categoria_nueva_id = ${o.id}`,
    );
    await db.execute(
      sql`UPDATE categorias SET activo = false, reemplazada_por_id = ${m.destinoId}, updated_at = now() WHERE id = ${o.id}`,
    );
    await db.execute(
      sql`INSERT INTO categorias_alias (slug_antiguo, categoria_id, motivo)
          VALUES (${o.slug}, ${m.destinoId}, ${m.motivo ?? 'merge'})
          ON CONFLICT (slug_antiguo) DO NOTHING`,
    );
    log(`  ✓ fusionado: ${o.slug} → ${m.destinoSlug}`);
  }
}

// Deletes (solo si usage=0)
for (const d of deletes) {
  const u = await usageOf(d.catId);
  const total =
    u.movimientos + u.reglas + u.mccPorNombre + u.mccCatalogo + u.marcas + u.correcciones;
  if (total > 0) {
    log(`  ⚠️  skip borrar ${d.slug}: ${total} refs (usar fusionar)`);
    continue;
  }
  await db.execute(sql`DELETE FROM categorias WHERE id = ${d.catId}`);
  log(`  ✓ borrado: ${d.slug}`);
}

log('\n--- Apply completado ---');
log('Regenera seed: pnpm db:seed:dump');
log('Re-run bench: node scripts/bench-bypass-diff.mjs mcc_por_nombre');
process.exit(0);
