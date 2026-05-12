import 'dotenv/config';
import XLSX from 'xlsx';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

interface TufiRow {
  COMMERCE_CODE: number | string | null;
  COMMERCE_NAME: string | null;
  MCC_CODE: number | string | null;
  MCC_DESCRIPTION: string | null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const wb = XLSX.readFile('/Users/aldonegri/Downloads/Comercios pagados por QR 2026.xlsx');
  const rows = XLSX.utils.sheet_to_json<TufiRow>(wb.Sheets['COmmerce TuFi']!, { defval: null });
  console.log(`hoja TuFi: ${rows.length.toLocaleString()} filas`);

  // 1) Unique MCC_CODE → MCC_DESCRIPTION (con conteo)
  const mccs = new Map<string, { desc: string; count: number; descAlt: Set<string> }>();
  for (const r of rows) {
    const code = r.MCC_CODE;
    if (code == null || String(code).trim() === '') continue;
    const k = String(code).padStart(4, '0');
    const desc = (r.MCC_DESCRIPTION ?? '').toString().trim();
    let slot = mccs.get(k);
    if (!slot) {
      slot = { desc, count: 0, descAlt: new Set() };
      mccs.set(k, slot);
    }
    slot.count++;
    if (desc) slot.descAlt.add(desc);
  }
  console.log(`MCC_CODE únicos: ${mccs.size}`);

  // Conflictos: si un MCC tiene >1 descripción distinta, registrar
  const conflictos: Array<{ mcc: string; descs: string[]; count: number }> = [];
  for (const [k, v] of mccs) {
    if (v.descAlt.size > 1) {
      conflictos.push({ mcc: k, descs: [...v.descAlt], count: v.count });
    }
  }
  conflictos.sort((a, b) => b.count - a.count);
  if (conflictos.length) {
    console.log(`\n⚠️  Conflictos descripción (${conflictos.length}):`);
    for (const c of conflictos.slice(0, 20)) {
      console.log(
        `  ${c.mcc} (${c.count} filas): ${c.descs.map((d) => JSON.stringify(d)).join(' | ')}`,
      );
    }
  }

  // 2) Estado actual DB
  const dbRes = await db.execute(sql`
    SELECT cod_mcc AS codigo, descripcion, categoria_id FROM mcc_catalogo
  `);
  const dbMap = new Map<string, { descripcion: string | null; categoria_id: string | null }>();
  for (const r of dbRes.rows as Array<{
    codigo: string;
    descripcion: string | null;
    categoria_id: string | null;
  }>) {
    dbMap.set(r.codigo.padStart(4, '0'), {
      descripcion: r.descripcion,
      categoria_id: r.categoria_id,
    });
  }

  // 3) Diff
  const insertar: Array<{ mcc: string; desc: string; count: number }> = [];
  const actualizarDesc: Array<{
    mcc: string;
    descNueva: string;
    descVieja: string | null;
    count: number;
  }> = [];
  const yaOk: number[] = [];

  for (const [k, v] of mccs) {
    const elegida = [...v.descAlt][0] ?? v.desc; // primera descripción (en conflicto, tomar mayoritaria sería mejor)
    const existing = dbMap.get(k);
    if (!existing) {
      insertar.push({ mcc: k, desc: elegida, count: v.count });
    } else if ((existing.descripcion ?? '').trim() !== elegida.trim() && elegida) {
      actualizarDesc.push({
        mcc: k,
        descNueva: elegida,
        descVieja: existing.descripcion,
        count: v.count,
      });
    } else {
      yaOk.push(v.count);
    }
  }

  // En DB pero no en archivo (no remover, solo reportar)
  const enDbNoArchivo: string[] = [];
  for (const k of dbMap.keys()) if (!mccs.has(k)) enDbNoArchivo.push(k);

  insertar.sort((a, b) => b.count - a.count);
  actualizarDesc.sort((a, b) => b.count - a.count);

  console.log(`\n=== PLAN ===`);
  console.log(`insertar:           ${insertar.length} MCCs`);
  console.log(`actualizar desc:    ${actualizarDesc.length} MCCs`);
  console.log(`ya OK:              ${yaOk.length} MCCs`);
  console.log(`en DB no en archivo: ${enDbNoArchivo.length} MCCs (no se tocan)`);

  console.log(`\n--- INSERTAR (${insertar.length}) ---`);
  for (const x of insertar.slice(0, 30))
    console.log(`  ${x.mcc}  ${x.count.toString().padStart(5)}  ${x.desc}`);
  if (insertar.length > 30) console.log(`  ... +${insertar.length - 30} más`);

  console.log(`\n--- ACTUALIZAR DESCRIPCIÓN (${actualizarDesc.length}) ---`);
  for (const x of actualizarDesc.slice(0, 30))
    console.log(
      `  ${x.mcc}  vieja=${JSON.stringify(x.descVieja)} → nueva=${JSON.stringify(x.descNueva)}`,
    );
  if (actualizarDesc.length > 30) console.log(`  ... +${actualizarDesc.length - 30} más`);

  if (!apply) {
    console.log(`\n(dry-run; agregá --apply para ejecutar)`);
    process.exit(0);
  }

  console.log(`\n>>> APLICANDO`);
  let ins = 0,
    upd = 0;
  for (const x of insertar) {
    await db.execute(sql`
      INSERT INTO mcc_catalogo (cod_mcc, descripcion, source, ambiguo)
      VALUES (${x.mcc}, ${x.desc}, 'tufi', false)
      ON CONFLICT (cod_mcc) DO NOTHING
    `);
    ins++;
  }
  for (const x of actualizarDesc) {
    await db.execute(sql`
      UPDATE mcc_catalogo
      SET descripcion = ${x.descNueva}, source = 'tufi', updated_at = now()
      WHERE cod_mcc = ${x.mcc}
    `);
    upd++;
  }
  console.log(`insertados: ${ins}`);
  console.log(`actualizados: ${upd}`);

  const total = await db.execute(sql`SELECT count(*)::int AS c FROM mcc_catalogo`);
  console.log(`total mcc_catalogo ahora: ${(total.rows[0] as { c: number }).c}`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
