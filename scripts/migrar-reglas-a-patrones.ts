import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { reglasRegex, patrones } from '../src/db/schema/index.js';

export interface MigracionResultado {
  total: number;
  insertadas: number;
  skip: number;
}

export async function migrarReglasAPatrones(database = db): Promise<MigracionResultado> {
  const reglas = await database
    .select({
      patron: reglasRegex.patron,
      categoriaId: reglasRegex.categoriaId,
      prioridad: reglasRegex.prioridad,
      descripcion: reglasRegex.descripcion,
    })
    .from(reglasRegex)
    .where(eq(reglasRegex.activo, true));

  let insertadas = 0;
  let skip = 0;

  for (const r of reglas) {
    const result = await database
      .insert(patrones)
      .values({
        tipo: 'regex',
        valor: r.patron,
        categoriaId: r.categoriaId,
        prioridad: r.prioridad,
        descripcion: r.descripcion,
        fuente: 'manual',
      })
      .onConflictDoNothing({
        target: [patrones.tipo, patrones.valor, patrones.categoriaId],
      })
      .returning({ id: patrones.id });

    if (result.length > 0) insertadas++;
    else skip++;
  }

  return { total: reglas.length, insertadas, skip };
}

async function main(): Promise<void> {
  const r = await migrarReglasAPatrones();
  console.log(JSON.stringify(r, null, 2));
  await pool.end();
}

void sql;

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
