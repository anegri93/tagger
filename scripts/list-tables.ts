import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const r = await db.execute(sql`
    SELECT
      t.table_name,
      (SELECT count(*)::int FROM information_schema.columns c WHERE c.table_name = t.table_name) AS cols,
      pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) AS size
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
    ORDER BY t.table_name
  `);
  const rows = r.rows as Array<{ table_name: string; cols: number; size: string }>;
  for (const x of rows) {
    const c = await db.execute(sql.raw(`SELECT count(*)::int AS c FROM "${x.table_name}"`));
    const cnt = (c.rows[0] as { c: number }).c;
    console.log(`${x.table_name.padEnd(35)} rows=${cnt.toString().padStart(8)} cols=${x.cols} size=${x.size}`);
  }
  process.exit(0);
}
main();
