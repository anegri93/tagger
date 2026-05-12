import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

async function main() {
  const apply = process.argv.includes('--apply');

  // 1. Cuántos NULL ahora tienen sugerencia
  const r1 = await db.execute(sql`
    SELECT count(*)::int AS c FROM comercios_catalogo
    WHERE fuente_categoria IS NULL AND categoria_nueva_id IS NOT NULL
  `);
  console.log(`NULL → categorizar (con sugerencia): ${(r1.rows[0] as { c: number }).c}`);

  // 2. Cuántos diffs
  const r2 = await db.execute(sql`
    SELECT count(*)::int AS c FROM comercios_catalogo
    WHERE categoria_nueva_id IS NOT NULL
      AND categoria_id != categoria_nueva_id
      AND fuente_categoria IS NOT NULL
  `);
  console.log(`diffs (cambio sugerido): ${(r2.rows[0] as { c: number }).c}`);

  if (!apply) {
    console.log('\n(dry-run; agregá --apply)');
    process.exit(0);
  }

  // Aplica TODOS los recat.* (sin categoría + cambios)
  const u = await db.execute(sql`
    UPDATE comercios_catalogo SET
      categoria_id = categoria_nueva_id,
      fuente_categoria = fuente_nueva,
      confianza = confianza_nueva,
      evidencia = evidencia_nueva,
      requiere_revision = CASE WHEN confianza_nueva >= 0.7 THEN false ELSE true END,
      updated_at = now()
    WHERE categoria_nueva_id IS NOT NULL
      AND (fuente_categoria IS NULL OR categoria_id != categoria_nueva_id OR fuente_categoria != fuente_nueva)
  `);
  console.log(`actualizados: ${u.rowCount}`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
