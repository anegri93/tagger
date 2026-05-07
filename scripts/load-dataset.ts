import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { datasets, datasetComercios } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

function parseArgs(): { slug: string; nombre: string; csv: string; descripcion?: string } {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  if (!args.slug || !args.nombre || !args.csv) {
    console.error('uso: load-dataset --slug=<slug> --nombre="Nombre" --csv=<path> [--descripcion=...]');
    process.exit(1);
  }
  return {
    slug: args.slug,
    nombre: args.nombre,
    csv: args.csv,
    descripcion: args.descripcion,
  };
}

function parseCsv(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let header = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (header) {
      header = false;
      continue;
    }
    // CSV con 1 columna; quitar comillas si las hay
    const val = trimmed.replace(/^"(.*)"$/, '$1').trim();
    if (val) out.push(val);
  }
  return out;
}

async function main() {
  const { slug, nombre, csv, descripcion } = parseArgs();
  const content = readFileSync(csv, 'utf8');
  const nombres = parseCsv(content);
  console.log(`[load-dataset] slug=${slug} csv=${csv} filas=${nombres.length}`);

  // upsert dataset
  const existing = await db.select().from(datasets).where(eq(datasets.slug, slug));
  let datasetId: string;
  if (existing.length > 0) {
    datasetId = existing[0].id;
    console.log(`[load-dataset] dataset existente id=${datasetId}`);
  } else {
    const inserted = await db
      .insert(datasets)
      .values({ slug, nombre, descripcion: descripcion ?? null })
      .returning({ id: datasets.id });
    datasetId = inserted[0].id;
    console.log(`[load-dataset] dataset creado id=${datasetId}`);
  }

  // bulk insert con ON CONFLICT DO NOTHING
  const CHUNK = 1000;
  let insertados = 0;
  for (let i = 0; i < nombres.length; i += CHUNK) {
    const slice = nombres.slice(i, i + CHUNK);
    const rows = slice.map((n) => ({ datasetId, nombre: n }));
    const res = await db
      .insert(datasetComercios)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: datasetComercios.id });
    insertados += res.length;
    if ((i / CHUNK) % 10 === 0) {
      console.log(`[load-dataset] progreso ${i + slice.length}/${nombres.length}`);
    }
  }

  const totalRow = await db.execute(
    sql`SELECT count(*)::int AS total FROM dataset_comercios WHERE dataset_id = ${datasetId}`,
  );
  const total = (totalRow.rows[0] as { total: number }).total;
  console.log(`[load-dataset] insertados nuevos=${insertados} total_dataset=${total}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
