import 'dotenv/config';
import XLSX from 'xlsx';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const wb = XLSX.readFile('/Users/aldonegri/Downloads/Comercios pagados por QR 2026.xlsx');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.commerces!, { defval: null });

  const mccCounts = new Map<string, number>();
  for (const r of rows) {
    const m = r['MCC Combined'];
    if (m == null || m === '' || String(m).trim() === '') continue;
    const k = String(m).padStart(4, '0');
    mccCounts.set(k, (mccCounts.get(k) ?? 0) + 1);
  }

  const dbRes = await db.execute(sql`
    SELECT m.cod_mcc AS codigo, m.descripcion, m.ambiguo, c.slug
    FROM mcc_catalogo m
    LEFT JOIN categorias c ON c.id = m.categoria_id
  `);
  const dbMap = new Map<string, { slug: string | null; descripcion: string | null; ambiguo: boolean }>();
  for (const r of dbRes.rows as Array<{ codigo: string; descripcion: string | null; ambiguo: boolean; slug: string | null }>) {
    dbMap.set(r.codigo.padStart(4, '0'), { slug: r.slug, descripcion: r.descripcion, ambiguo: r.ambiguo });
  }

  const enArchivo = [...mccCounts.keys()].sort();
  const faltantes: Array<{ mcc: string; comercios: number }> = [];
  const sinCat: Array<{ mcc: string; comercios: number; descripcion: string | null }> = [];
  const ambiguos: Array<{ mcc: string; comercios: number; descripcion: string | null }> = [];
  const conCat: Array<{ mcc: string; comercios: number; slug: string; descripcion: string | null }> = [];

  for (const m of enArchivo) {
    const info = dbMap.get(m);
    if (!info) {
      faltantes.push({ mcc: m, comercios: mccCounts.get(m)! });
    } else if (info.ambiguo) {
      ambiguos.push({ mcc: m, comercios: mccCounts.get(m)!, descripcion: info.descripcion });
    } else if (!info.slug) {
      sinCat.push({ mcc: m, comercios: mccCounts.get(m)!, descripcion: info.descripcion });
    } else {
      conCat.push({ mcc: m, comercios: mccCounts.get(m)!, slug: info.slug, descripcion: info.descripcion });
    }
  }

  faltantes.sort((a, b) => b.comercios - a.comercios);
  sinCat.sort((a, b) => b.comercios - a.comercios);
  ambiguos.sort((a, b) => b.comercios - a.comercios);
  conCat.sort((a, b) => b.comercios - a.comercios);

  const totalComercios = [...mccCounts.values()].reduce((a, b) => a + b, 0);
  const cobertura = conCat.reduce((a, b) => a + b.comercios, 0);

  console.log(`=== MCCs en archivo: ${enArchivo.length}  (${totalComercios.toLocaleString()} comercios) ===`);
  console.log(`con categoría asignada: ${conCat.length} MCCs (${cobertura.toLocaleString()} comercios = ${((100*cobertura)/totalComercios).toFixed(1)}%)`);
  console.log(`ambiguos en DB:         ${ambiguos.length}`);
  console.log(`en DB sin categoría:    ${sinCat.length}`);
  console.log(`faltan en DB:           ${faltantes.length}`);

  console.log(`\n--- FALTANTES en mcc_catalogo (${faltantes.length}) ---`);
  for (const f of faltantes) console.log(`  ${f.mcc}  ${f.comercios.toLocaleString().padStart(8)} comercios`);

  console.log(`\n--- AMBIGUOS en DB (${ambiguos.length}) ---`);
  for (const f of ambiguos) console.log(`  ${f.mcc}  ${f.comercios.toLocaleString().padStart(8)}  ${f.descripcion ?? ''}`);

  console.log(`\n--- En DB SIN categoría (${sinCat.length}) ---`);
  for (const f of sinCat) console.log(`  ${f.mcc}  ${f.comercios.toLocaleString().padStart(8)}  ${f.descripcion ?? ''}`);

  console.log(`\n--- CON categoría (todos ${conCat.length}) ---`);
  for (const f of conCat) console.log(`  ${f.mcc}  →  ${f.slug.padEnd(15)} ${f.comercios.toLocaleString().padStart(8)}  ${f.descripcion ?? ''}`);

  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
