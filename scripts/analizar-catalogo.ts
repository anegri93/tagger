import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const total = await db.execute(sql`SELECT count(*)::int AS c FROM comercios_catalogo`);
  const t = (total.rows[0] as { c: number }).c;
  console.log(`=== TOTAL: ${t.toLocaleString()} comercios ===\n`);

  const fuente = await db.execute(sql`
    SELECT COALESCE(fuente_categoria::text,'NULL') AS f, count(*)::int AS c
    FROM comercios_catalogo GROUP BY fuente_categoria ORDER BY c DESC
  `);
  console.log('Por fuente_categoria:');
  for (const r of fuente.rows as Array<{ f: string; c: number }>) {
    console.log(`  ${r.f.padEnd(15)} ${r.c.toLocaleString().padStart(8)} (${((100*r.c)/t).toFixed(1)}%)`);
  }

  const conf = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE confianza >= 0.9)::int AS alta,
      count(*) FILTER (WHERE confianza >= 0.7 AND confianza < 0.9)::int AS media,
      count(*) FILTER (WHERE confianza < 0.7 AND confianza IS NOT NULL)::int AS baja,
      count(*) FILTER (WHERE confianza IS NULL)::int AS null_conf
    FROM comercios_catalogo
  `);
  console.log('\nPor confianza:');
  const cf = conf.rows[0] as { alta: number; media: number; baja: number; null_conf: number };
  console.log(`  >= 0.90       ${cf.alta.toLocaleString().padStart(8)}`);
  console.log(`  0.70-0.89     ${cf.media.toLocaleString().padStart(8)}`);
  console.log(`  < 0.70        ${cf.baja.toLocaleString().padStart(8)}`);
  console.log(`  NULL          ${cf.null_conf.toLocaleString().padStart(8)}`);

  const rev = await db.execute(sql`
    SELECT count(*) FILTER (WHERE requiere_revision = true)::int AS c FROM comercios_catalogo
  `);
  console.log(`\nrequiere_revision = true: ${(rev.rows[0] as { c: number }).c.toLocaleString()}`);

  const topCat = await db.execute(sql`
    SELECT c.slug, c.nombre, count(*)::int AS c
    FROM comercios_catalogo cc JOIN categorias c ON c.id = cc.categoria_id
    GROUP BY c.slug, c.nombre ORDER BY c DESC LIMIT 20
  `);
  console.log('\nTop 20 categorías asignadas:');
  for (const r of topCat.rows as Array<{ slug: string; nombre: string; c: number }>) {
    console.log(`  ${r.slug.padEnd(18)} ${r.c.toLocaleString().padStart(8)} (${((100*r.c)/t).toFixed(1)}%)`);
  }

  const mcc = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE mcc_original IS NOT NULL)::int AS con_mcc,
      count(*) FILTER (WHERE mcc_original IS NULL)::int AS sin_mcc
    FROM comercios_catalogo
  `);
  const m = mcc.rows[0] as { con_mcc: number; sin_mcc: number };
  console.log(`\nCon MCC original: ${m.con_mcc.toLocaleString()} (${((100*m.con_mcc)/t).toFixed(1)}%)`);
  console.log(`Sin MCC:          ${m.sin_mcc.toLocaleString()} (${((100*m.sin_mcc)/t).toFixed(1)}%)`);

  const bancard = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE bancard_id IS NOT NULL)::int AS con_bid,
      count(*) FILTER (WHERE codigo_comercio IS NOT NULL)::int AS con_cod,
      count(*) FILTER (WHERE bancard_id IS NOT NULL AND codigo_comercio IS NOT NULL)::int AS con_ambos
    FROM comercios_catalogo
  `);
  const b = bancard.rows[0] as { con_bid: number; con_cod: number; con_ambos: number };
  console.log(`\nCon bancard_id:    ${b.con_bid.toLocaleString()}`);
  console.log(`Con codigo:        ${b.con_cod.toLocaleString()}`);
  console.log(`Con ambos (key):   ${b.con_ambos.toLocaleString()}`);

  const muestraSinCat = await db.execute(sql`
    SELECT nombre, mcc_original FROM comercios_catalogo
    WHERE requiere_revision = true OR confianza IS NULL OR confianza < 0.7
    ORDER BY random() LIMIT 10
  `);
  console.log('\nMuestra 10 comercios sin categorizar / baja confianza:');
  for (const r of muestraSinCat.rows as Array<{ nombre: string; mcc_original: string | null }>) {
    console.log(`  ${r.nombre.padEnd(50)} mcc=${r.mcc_original ?? '—'}`);
  }
  process.exit(0);
}
main();
