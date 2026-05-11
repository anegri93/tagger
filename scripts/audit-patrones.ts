import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

interface DeleteOp { kind: 'delete'; cat: string; tipo: string; valor: string; note: string; }
interface MoveOp { kind: 'move'; cat: string; tipo: string; valor: string; newCat: string; note: string; }
interface UpdateOp { kind: 'update'; cat: string; tipo: string; valor: string; newTipo?: string; newValor?: string; newPrio?: number; note: string; }
type Op = DeleteOp | MoveOp | UpdateOp;

const ops: Op[] = [
  // DELETES
  { kind: 'delete', cat: 'otros', tipo: 'contiene', valor: 'CENTER', note: 'genérico' },
  { kind: 'delete', cat: 'otros', tipo: 'contiene', valor: 'COMPAÑIA', note: 'genérico' },
  { kind: 'delete', cat: 'otros', tipo: 'contiene', valor: 'STORE', note: 'genérico' },
  { kind: 'delete', cat: 'otros', tipo: 'contiene', valor: 'TIENDA', note: 'genérico' },
  { kind: 'delete', cat: 'otros', tipo: 'contiene', valor: 'NOVEDADES', note: 'no es otros' },
  { kind: 'delete', cat: 'combustible', tipo: 'contiene', valor: 'SERVICIOS', note: 'genérico' },
  { kind: 'delete', cat: 'supermercado', tipo: 'contiene', valor: 'EXPRESS', note: 'DHL/MENSAJERIA' },
  { kind: 'delete', cat: 'salud', tipo: 'contiene', valor: 'BARBER', note: 'duplica regex' },
  { kind: 'delete', cat: 'salud', tipo: 'contiene', valor: 'BARBERIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'salud', tipo: 'contiene', valor: 'VISION', note: 'TELEVISION FP' },
  { kind: 'delete', cat: 'restaurante', tipo: 'contiene', valor: 'HELADERIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'restaurante', tipo: 'contiene', valor: 'PANADERIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'restaurante', tipo: 'contiene', valor: 'PIZZERIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'restaurante', tipo: 'contiene', valor: 'PARRILLA', note: 'duplica regex' },
  { kind: 'delete', cat: 'restaurante', tipo: 'contiene', valor: 'LOMITERIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'restaurante', tipo: 'contiene', valor: 'RESTAURANTE', note: 'duplica regex' },
  { kind: 'delete', cat: 'restaurante', tipo: 'regex', valor: '\\bKING\\b', note: 'BURGER KING ya existe' },
  { kind: 'delete', cat: 'alimentacion', tipo: 'contiene', valor: 'BURGER', note: 'colisión restaurante' },
  { kind: 'delete', cat: 'alimentacion', tipo: 'contiene', valor: 'BURGUER', note: 'colisión restaurante' },
  { kind: 'delete', cat: 'alimentacion', tipo: 'contiene', valor: 'PIZZA', note: 'colisión restaurante' },
  { kind: 'delete', cat: 'transferencia', tipo: 'regex', valor: '\\bMANGO\\b', note: 'dejar solo ^MANGO' },
  { kind: 'delete', cat: 'farmacia', tipo: 'contiene', valor: 'FARMA', note: 'duplica regex' },
  { kind: 'delete', cat: 'farmacia', tipo: 'contiene', valor: 'FARMACIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'farmacia', tipo: 'contiene', valor: 'FCIA', note: 'cubierto regex' },
  { kind: 'delete', cat: 'farmacia', tipo: 'contiene', valor: 'PUNTO', note: 'genérico' },
  { kind: 'delete', cat: 'farmacia', tipo: 'contiene', valor: 'OLIVA', note: 'apellido' },
  { kind: 'delete', cat: 'educacion', tipo: 'contiene', valor: 'LIBRERIA', note: 'duplica regex' },
  { kind: 'delete', cat: 'tecnologia', tipo: 'contiene', valor: 'ELECTRÓNICA', note: 'tilde duplicado' },
  { kind: 'delete', cat: 'hogar', tipo: 'contiene', valor: 'ALEX', note: 'nombre' },
  { kind: 'delete', cat: 'alimentacion', tipo: 'contiene', valor: 'RINCON DEL', note: 'genérico' },

  // MOVES
  { kind: 'move', cat: 'otros', tipo: 'contiene', valor: 'JOYAS', newCat: 'ropa', note: 'mover' },
  { kind: 'move', cat: 'otros', tipo: 'contiene', valor: 'AUTOREPUESTOS', newCat: 'servicios', note: 'mover' },
  { kind: 'move', cat: 'otros', tipo: 'contiene', valor: 'REPUESTOS', newCat: 'servicios', note: 'mover' },
  { kind: 'move', cat: 'transporte', tipo: 'contiene', valor: 'PARADOR', newCat: 'viajes', note: 'parador=hotel ruta' },
  { kind: 'move', cat: 'servicios', tipo: 'contiene', valor: 'COSMETICO', newCat: 'salud', note: 'mover' },
  { kind: 'move', cat: 'servicios', tipo: 'contiene', valor: 'BEAUTY', newCat: 'salud', note: 'mover' },
  { kind: 'move', cat: 'servicios', tipo: 'contiene', valor: 'AUTOMOTIVO', newCat: 'transporte', note: 'mover' },
  { kind: 'move', cat: 'supermercado', tipo: 'contiene', valor: 'MERCERIA', newCat: 'ropa', note: 'mover' },

  // UPDATES (cambio tipo y/o valor y/o prio)
  { kind: 'update', cat: 'salud', tipo: 'contiene', valor: 'LAB', newTipo: 'regex', newValor: '\\bLAB\\b', newPrio: 20, note: 'word-boundary' },
  { kind: 'update', cat: 'salud', tipo: 'contiene', valor: 'GYM', newTipo: 'regex', newValor: '\\bGYM\\b', newPrio: 20, note: 'word-boundary' },
  { kind: 'update', cat: 'salud', tipo: 'contiene', valor: 'SPA', newTipo: 'regex', newValor: '\\bSPA\\b', newPrio: 20, note: 'word-boundary' },
  { kind: 'update', cat: 'supermercado', tipo: 'regex', valor: '\\bSHOP\\b', newPrio: 50, note: 'bajar prio' },
  { kind: 'update', cat: 'entretenimiento', tipo: 'regex', valor: '\\bCLUB\\b', newPrio: 50, note: 'bajar prio' },
  { kind: 'update', cat: 'azar', tipo: 'regex',
    valor: '\\b(AZAR|SLOTS?|TRAGAMONEDAS?|CASINO|GAMING|APUESTAS?|BETSAT|GIRO\\s?WIN|SOLBET|PGP|UPAY|EGLOBALT)\\b',
    newValor: '\\b(AZAR|SLOTS?|TRAGAMONEDAS?|CASINO|GAMING|APUESTAS?|BETSAT|GIRO\\s?WIN|SOLBET)\\b',
    note: 'quitar UPAY/PGP/EGLOBALT' },
  { kind: 'update', cat: 'tecnologia', tipo: 'regex', valor: '\\bELECTR\\b', newValor: '\\bELECTRONICA\\b', newPrio: 30, note: 'limitar a ELECTRONICA' },
];

async function exists(catUuid: string, tipo: string, valor: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM patrones
    WHERE tipo = ${tipo}::patron_tipo AND valor = ${valor} AND categoria_id = ${catUuid}
    LIMIT 1
  `);
  return r.rows.length > 0;
}

async function main() {
  const catsRes = await db.execute(sql`SELECT id, slug FROM categorias`);
  const catId = new Map<string, string>();
  for (const r of catsRes.rows as Array<{ id: string; slug: string }>) catId.set(r.slug, r.id);

  let dDone = 0, dSkip = 0, mDone = 0, mSkip = 0, uDone = 0, uSkip = 0;
  const log: string[] = [];

  for (const op of ops) {
    const catUuid = catId.get(op.cat);
    if (!catUuid) { log.push(`MISS_CAT ${op.cat}`); continue; }

    if (op.kind === 'delete') {
      const r = await db.execute(sql`
        DELETE FROM patrones
        WHERE tipo = ${op.tipo}::patron_tipo AND valor = ${op.valor} AND categoria_id = ${catUuid}
      `);
      if (r.rowCount && r.rowCount > 0) { dDone++; log.push(`DEL ${op.cat}/${op.tipo}/${op.valor}`); }
      else { dSkip++; }
    } else if (op.kind === 'move') {
      const newCatUuid = catId.get(op.newCat);
      if (!newCatUuid) { log.push(`MISS_NEWCAT ${op.newCat}`); continue; }
      const inOrigen = await exists(catUuid, op.tipo, op.valor);
      const inDest = await exists(newCatUuid, op.tipo, op.valor);
      if (!inOrigen && inDest) { mSkip++; continue; } // ya movido
      if (inOrigen && inDest) {
        await db.execute(sql`
          DELETE FROM patrones
          WHERE tipo = ${op.tipo}::patron_tipo AND valor = ${op.valor} AND categoria_id = ${catUuid}
        `);
        mDone++; log.push(`MOVE_DUP ${op.cat}→${op.newCat} ${op.valor}`);
      } else if (inOrigen && !inDest) {
        await db.execute(sql`
          UPDATE patrones SET categoria_id = ${newCatUuid}, updated_at = now()
          WHERE tipo = ${op.tipo}::patron_tipo AND valor = ${op.valor} AND categoria_id = ${catUuid}
        `);
        mDone++; log.push(`MOVE ${op.cat}→${op.newCat} ${op.valor}`);
      } else {
        mSkip++;
      }
    } else if (op.kind === 'update') {
      const inOrigen = await exists(catUuid, op.tipo, op.valor);
      const targetTipo = op.newTipo ?? op.tipo;
      const targetValor = op.newValor ?? op.valor;
      const targetExists = await exists(catUuid, targetTipo, targetValor);
      if (!inOrigen && targetExists) { uSkip++; continue; }
      if (!inOrigen && !targetExists) { uSkip++; log.push(`MISS_UPDATE ${op.cat}/${op.valor}`); continue; }
      if (inOrigen && targetExists && (targetTipo !== op.tipo || targetValor !== op.valor)) {
        // destino ya existe — borrar origen
        await db.execute(sql`
          DELETE FROM patrones
          WHERE tipo = ${op.tipo}::patron_tipo AND valor = ${op.valor} AND categoria_id = ${catUuid}
        `);
        uDone++; log.push(`UPDATE_DUP ${op.cat} ${op.valor}→(existe ya) deleted`);
        continue;
      }
      await db.execute(sql`
        UPDATE patrones SET
          tipo = ${targetTipo}::patron_tipo,
          valor = ${targetValor},
          prioridad = COALESCE(${op.newPrio ?? null}, prioridad),
          updated_at = now()
        WHERE tipo = ${op.tipo}::patron_tipo AND valor = ${op.valor} AND categoria_id = ${catUuid}
      `);
      uDone++;
      log.push(`UPDATE ${op.cat} ${op.tipo}/${op.valor} → ${targetTipo}/${targetValor}${op.newPrio != null ? ` prio=${op.newPrio}` : ''}`);
    }
  }

  const total = await db.execute(sql`SELECT count(*)::int AS c FROM patrones`);
  console.log(log.join('\n'));
  console.log(`\n=== RESULTADO ===`);
  console.log(`deletes: aplicados=${dDone} ya-ok=${dSkip}`);
  console.log(`moves:   aplicados=${mDone} ya-ok=${mSkip}`);
  console.log(`updates: aplicados=${uDone} ya-ok=${uSkip}`);
  console.log(`total patrones ahora: ${(total.rows[0] as { c: number }).c}`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
