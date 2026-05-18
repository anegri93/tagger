import 'dotenv/config';
import XLSX from 'xlsx';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { normalize } from '../src/domain/normalize.js';

interface TufiRow {
  COMMERCE_CODE: number | string | null;
  COMMERCE_NAME: string | null;
  MCC_CODE: number | string | null;
  MCC_DESCRIPTION: string | null;
}

const SHEET_PATH = '/Users/aldonegri/Downloads/Comercios pagados por QR 2026.xlsx';
const SHEET_NAME = 'COmmerce TuFi';
const FALLBACK_SLUG = 'otros';

async function main() {
  const apply = process.argv.includes('--apply');
  const wb = XLSX.readFile(SHEET_PATH);
  const rows = XLSX.utils.sheet_to_json<TufiRow>(wb.Sheets[SHEET_NAME]!, { defval: null });
  console.log(`hoja TuFi: ${rows.length.toLocaleString()} filas`);

  // Agrupar por nombre_normalizado → contar MCCs
  type Slot = { nombreOriginal: string; mccCounts: Map<string, number> };
  const grupos = new Map<string, Slot>();

  let sinNombre = 0;
  let sinMcc = 0;
  for (const r of rows) {
    const nombreRaw = (r.COMMERCE_NAME ?? '').toString().trim();
    if (!nombreRaw) {
      sinNombre++;
      continue;
    }
    const norm = normalize(nombreRaw);
    if (!norm) {
      sinNombre++;
      continue;
    }
    const mccRaw = r.MCC_CODE;
    if (mccRaw == null || String(mccRaw).trim() === '') {
      sinMcc++;
      continue;
    }
    const mcc = String(mccRaw).padStart(4, '0');

    let slot = grupos.get(norm);
    if (!slot) {
      slot = { nombreOriginal: nombreRaw, mccCounts: new Map() };
      grupos.set(norm, slot);
    }
    slot.mccCounts.set(mcc, (slot.mccCounts.get(mcc) ?? 0) + 1);
  }

  console.log(`nombres únicos normalizados: ${grupos.size.toLocaleString()}`);
  console.log(`filas sin nombre: ${sinNombre}`);
  console.log(`filas sin MCC: ${sinMcc}`);

  // Resolver categoría fallback
  const fbRes = await db.execute(sql`SELECT id FROM categorias WHERE slug = ${FALLBACK_SLUG} LIMIT 1`);
  const fallbackId = (fbRes.rows[0] as { id: string } | undefined)?.id;
  if (!fallbackId) {
    console.error(`no se encontró categoría fallback slug=${FALLBACK_SLUG}`);
    process.exit(1);
  }

  // Cargar mapa mcc → { categoria_id, ambiguo }
  const mccRes = await db.execute(sql`SELECT cod_mcc, categoria_id, ambiguo FROM mcc_catalogo`);
  const mccMeta = new Map<string, { categoriaId: string | null; ambiguo: boolean }>();
  for (const r of mccRes.rows as Array<{
    cod_mcc: string;
    categoria_id: string | null;
    ambiguo: boolean;
  }>) {
    mccMeta.set(r.cod_mcc.padStart(4, '0'), { categoriaId: r.categoria_id, ambiguo: r.ambiguo });
  }

  // Reglas calidad
  const CONSENSO_MIN = 0.5; // mayoritario debe ser >=50% para insertar
  const CONFIANZA_ALTA = 0.85; // consenso fuerte, MCC no ambiguo
  const CONFIANZA_MEDIA = 0.7; // consenso fuerte, MCC ambiguo
  const CONFIANZA_BAJA = 0.5; // consenso débil (<70%) → revisión

  type ToWrite = {
    nombre: string;
    nombreNorm: string;
    mcc: string;
    categoriaId: string;
    confianza: number;
    requiereRevision: boolean;
  };
  const writes: ToWrite[] = [];
  let ambiguosSheet = 0;
  let descartadosBajoConsenso = 0;
  let mccAmbiguoCount = 0;
  let revisionCount = 0;
  let usaFallback = 0;

  for (const [norm, slot] of grupos) {
    const entries = [...slot.mccCounts.entries()].sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, n]) => acc + n, 0);
    const [mccElegido, countElegido] = entries[0]!;
    const consenso = countElegido / total;
    const tieneAmbiguedadSheet = entries.length > 1;
    if (tieneAmbiguedadSheet) ambiguosSheet++;

    if (consenso < CONSENSO_MIN) {
      descartadosBajoConsenso++;
      continue;
    }

    const meta = mccMeta.get(mccElegido);
    const mccAmbiguo = meta?.ambiguo ?? false;
    if (mccAmbiguo) mccAmbiguoCount++;
    const categoriaId = meta?.categoriaId ?? fallbackId;
    if (!meta?.categoriaId) usaFallback++;

    let confianza: number;
    if (consenso < 0.7) confianza = CONFIANZA_BAJA;
    else if (mccAmbiguo) confianza = CONFIANZA_MEDIA;
    else confianza = CONFIANZA_ALTA;

    const requiereRevision =
      confianza === CONFIANZA_BAJA || (tieneAmbiguedadSheet && consenso < 0.8);
    if (requiereRevision) revisionCount++;

    writes.push({
      nombre: slot.nombreOriginal,
      nombreNorm: norm,
      mcc: mccElegido,
      categoriaId,
      confianza,
      requiereRevision,
    });
  }

  console.log(`a escribir: ${writes.length.toLocaleString()}`);
  console.log(`nombres ambiguos en sheet (>1 MCC): ${ambiguosSheet}`);
  console.log(`descartados por consenso <${CONSENSO_MIN * 100}%: ${descartadosBajoConsenso}`);
  console.log(`MCC marcado ambiguo en mcc_catalogo: ${mccAmbiguoCount}`);
  console.log(`marcados requiere_revision=true: ${revisionCount}`);
  console.log(`con categoría fallback "${FALLBACK_SLUG}": ${usaFallback}`);

  console.log(`\nmuestra (primeras 10):`);
  for (const w of writes.slice(0, 10)) {
    console.log(
      `  ${w.mcc}  conf=${w.confianza}  rev=${w.requiereRevision ? 'Y' : 'N'}  ${w.nombreNorm}`,
    );
  }

  if (!apply) {
    console.log(`\n(dry-run; agregá --apply para ejecutar)`);
    process.exit(0);
  }

  console.log(`\n>>> APLICANDO`);
  let ins = 0;
  let upd = 0;
  let err = 0;
  for (const w of writes) {
    try {
      const res = await db.execute(sql`
        INSERT INTO comercios_catalogo
          (nombre, nombre_normalizado, bancard_id, codigo_comercio, mcc, mcc_original,
           categoria_id, fuente_categoria, confianza, requiere_revision, mcc_inferido)
        VALUES
          (${w.nombre}, ${w.nombreNorm}, NULL, NULL, ${w.mcc}, ${w.mcc},
           ${w.categoriaId}, 'mcc'::fuente_categoria, ${w.confianza}, ${w.requiereRevision}, true)
        ON CONFLICT (nombre_normalizado) WHERE bancard_id IS NULL AND codigo_comercio IS NULL
        DO UPDATE SET
          nombre = EXCLUDED.nombre,
          mcc = EXCLUDED.mcc,
          mcc_original = EXCLUDED.mcc_original,
          categoria_id = EXCLUDED.categoria_id,
          fuente_categoria = EXCLUDED.fuente_categoria,
          confianza = EXCLUDED.confianza,
          requiere_revision = EXCLUDED.requiere_revision,
          mcc_inferido = EXCLUDED.mcc_inferido,
          updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `);
      const inserted = (res.rows[0] as { inserted: boolean } | undefined)?.inserted ?? true;
      if (inserted) ins++;
      else upd++;
    } catch (e) {
      err++;
      if (err <= 5) console.error(`  err ${w.nombreNorm}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`insertados: ${ins}`);
  console.log(`actualizados: ${upd}`);
  console.log(`errores: ${err}`);

  const total = await db.execute(sql`SELECT count(*)::int AS c FROM comercios_catalogo`);
  console.log(`total comercios_catalogo ahora: ${(total.rows[0] as { c: number }).c}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
