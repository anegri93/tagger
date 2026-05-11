import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { normalize } from '../src/domain/normalize.js';

const STOPWORDS = new Set([
  'DE','DEL','LA','EL','LOS','LAS','Y','A','EN','POR','PARA','CON','SAN','SANTA',
  'SA','SRL','SACI','EIRL','CIA','COMERC','COMERCIAL','EMPRESA','SERV','SERVICIOS',
  'EXP','EXPRESS','PY','PARAGUAY','II','III','IV','V','VI','SUC','SUCURSAL',
]);

async function main() {
  const r = await db.execute(sql`
    SELECT nombre FROM comercios_catalogo
    WHERE requiere_revision = true OR confianza IS NULL
  `);
  const nombres = (r.rows as Array<{ nombre: string }>).map((x) => x.nombre);
  console.log(`comercios sin cat: ${nombres.length}\n`);

  const tokens = new Map<string, number>();
  for (const n of nombres) {
    const norm = normalize(n);
    for (const t of norm.split(/\s+/)) {
      if (t.length < 4) continue;
      if (STOPWORDS.has(t)) continue;
      if (/^\d+$/.test(t)) continue;
      tokens.set(t, (tokens.get(t) ?? 0) + 1);
    }
  }
  const top = [...tokens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
  console.log('Top 80 tokens en sin_cat:');
  for (const [tok, c] of top) console.log(`  ${tok.padEnd(20)} ${c.toString().padStart(5)}`);
  process.exit(0);
}
main();
