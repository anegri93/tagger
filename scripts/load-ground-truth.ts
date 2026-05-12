import 'dotenv/config';
import { resolve } from 'node:path';
import XLSX from 'xlsx';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { testGroundTruth } from '../src/db/schema/index.js';
import { normalize } from '../src/domain/normalize.js';

interface Args {
  file: string;
  sheet: string;
  batchId: string;
  fuenteOrigen: string;
  topN: number | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, def?: string): string | undefined => {
    const idx = argv.indexOf(`--${k}`);
    if (idx === -1) return def;
    return argv[idx + 1];
  };
  const file = get('file');
  if (!file) {
    console.error('Falta --file <ruta xlsx>');
    process.exit(1);
  }
  const topNStr = get('top-n');
  return {
    file,
    sheet: get('sheet', 'DataMayo') ?? 'DataMayo',
    batchId: get('batch-id', 'datamayo-2026-05') ?? 'datamayo-2026-05',
    fuenteOrigen: get('fuente', 'datamayo-2026-05-qr-bancard') ?? 'datamayo-2026-05-qr-bancard',
    topN: topNStr ? Number(topNStr) : null,
  };
}

interface XlsxRow {
  Nombre: string | null;
  BancardId: string | null;
  Category: string | null;
  CommerceSector: string | null;
  CommerceCode: number | string | null;
  MCC: number | string | null;
  Cantidad: number | null;
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`file: ${args.file}`);
  console.log(`sheet: ${args.sheet}`);
  console.log(`batch_id: ${args.batchId}`);
  if (args.topN) console.log(`top_n: ${args.topN}`);

  const wb = XLSX.readFile(resolve(args.file));
  const sh = wb.Sheets[args.sheet];
  if (!sh) throw new Error(`Sheet ${args.sheet} no existe. Disponibles: ${wb.SheetNames.join(', ')}`);

  let rows = XLSX.utils.sheet_to_json<XlsxRow>(sh, { defval: null });
  console.log(`rows xlsx: ${rows.length}`);

  rows = rows.filter((r) => r.Nombre && String(r.Nombre).trim());
  rows.sort((a, b) => (b.Cantidad ?? 0) - (a.Cantidad ?? 0));
  if (args.topN) rows = rows.slice(0, args.topN);
  console.log(`rows a insertar: ${rows.length}`);

  const seen = new Set<string>();
  const dedup = rows.filter((r) => {
    const k = String(r.Nombre).trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`rows tras dedup por nombre: ${dedup.length}`);

  const chunkSize = 1000;
  let inserted = 0;
  for (let i = 0; i < dedup.length; i += chunkSize) {
    const chunk = dedup.slice(i, i + chunkSize);
    const values = chunk.map((r) => ({
      batchId: args.batchId,
      nombre: String(r.Nombre).trim(),
      nombreNormalizado: normalize(String(r.Nombre)),
      bancardId: r.BancardId ? String(r.BancardId).trim() : null,
      codigoComercio: r.CommerceCode != null ? String(r.CommerceCode).trim() : null,
      mcc: r.MCC != null ? String(r.MCC).trim() : null,
      categoriaXlsx: r.Category ? String(r.Category).trim() : null,
      sectorXlsx: r.CommerceSector ? String(r.CommerceSector).trim() : null,
      cantidad: r.Cantidad != null ? Number(r.Cantidad) : null,
      fuenteOrigen: args.fuenteOrigen,
    }));
    await db
      .insert(testGroundTruth)
      .values(values)
      .onConflictDoNothing({ target: [testGroundTruth.batchId, testGroundTruth.nombre] });
    inserted += chunk.length;
    if (inserted % 5000 === 0 || inserted === dedup.length) {
      console.log(`insertados ${inserted}/${dedup.length}`);
    }
  }

  const countRows = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM test_ground_truth WHERE batch_id = ${args.batchId}`,
  );
  console.log(`total en DB para batch_id=${args.batchId}: ${(countRows.rows[0] as { n: number }).n}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
