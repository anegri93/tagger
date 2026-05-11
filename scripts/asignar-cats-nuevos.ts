import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

// Asignaciones para los 34 MCCs nuevos (source='tufi', categoria_id IS NULL)
const asignaciones: Array<{ mcc: string; cat: string | null; ambiguo?: boolean; note: string }> = [
  // Productos digitales / entretenimiento
  { mcc: '5815', cat: 'entretenimiento', note: 'libros/peliculas/musica digital' },
  { mcc: '5816', cat: 'entretenimiento', note: 'juegos digitales' },
  { mcc: '5817', cat: 'tecnologia', note: 'aplicaciones digitales' },
  { mcc: '5818', cat: 'tecnologia', note: 'productos digitales multi' },
  { mcc: '5967', cat: 'entretenimiento', note: 'contenido adultos' },
  { mcc: '7829', cat: 'entretenimiento', note: 'producción video' },
  { mcc: '7991', cat: 'entretenimiento', note: 'atracciones turísticas' },
  { mcc: '7996', cat: 'entretenimiento', note: 'parques diversiones' },
  { mcc: '5735', cat: 'entretenimiento', note: 'estudio grabación' },

  // Financiero
  { mcc: '6010', cat: 'financiero', note: 'cash advance' },
  { mcc: '4829', cat: 'financiero', note: 'giro postal/transferencias' },
  { mcc: '5960', cat: 'financiero', note: 'venta seguros' },
  { mcc: '6211', cat: 'financiero', note: 'valores/títulos' },

  // Servicios
  { mcc: '5968', cat: 'servicios', note: 'subscripciones' },
  { mcc: '5964', cat: 'servicios', note: 'telemarketing catálogo' },
  { mcc: '5965', cat: 'servicios', note: 'telemarketing detal' },
  { mcc: '5969', cat: 'servicios', note: 'telemarketing no clasif' },
  { mcc: '7361', cat: 'servicios', note: 'agencia empleos' },
  { mcc: '7372', cat: 'tecnologia', note: 'transmisión datos / IT' },
  { mcc: '9222', cat: 'servicios', note: 'multas' },
  { mcc: '9399', cat: 'servicios', note: 'servicios gubernamentales' },

  // Transporte
  { mcc: '4112', cat: 'transporte', note: 'tren pasajeros' },
  { mcc: '4784', cat: 'transporte', note: 'puente peaje' },

  // Viajes (hoteles específicos)
  { mcc: '3533', cat: 'viajes', note: 'Hotel IBIS' },
  { mcc: '3638', cat: 'viajes', note: 'Howard Johnson' },

  // Salud
  { mcc: '7297', cat: 'salud', note: 'masajes' },

  // Supermercado
  { mcc: '5300', cat: 'supermercado', note: 'wholesale clubs' },

  // Ropa
  { mcc: '5137', cat: 'ropa', note: 'uniformes' },
  { mcc: '5931', cat: 'ropa', note: 'segunda mano' },

  // Restaurante
  { mcc: '5811', cat: 'restaurante', note: 'proveedores catering' },

  // Pendientes
  { mcc: '4411', cat: 'viajes', note: 'cruceros' },
  { mcc: '5698', cat: 'salud', note: 'pelucas (estética/belleza)' },
  { mcc: '5995', cat: 'mascotas', note: 'tienda mascotas' },
  { mcc: '7273', cat: 'servicios', note: 'escoltas/citas' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const catsRes = await db.execute(sql`SELECT id, slug FROM categorias`);
  const catId = new Map<string, string>();
  for (const r of catsRes.rows as Array<{ id: string; slug: string }>) catId.set(r.slug, r.id);

  // Verificar MCCs nuevos sin cat
  const nuevosRes = await db.execute(sql`
    SELECT cod_mcc, descripcion FROM mcc_catalogo
    WHERE source = 'tufi' AND categoria_id IS NULL
    ORDER BY cod_mcc
  `);
  const nuevos = nuevosRes.rows as Array<{ cod_mcc: string; descripcion: string | null }>;
  const nuevosSet = new Set(nuevos.map((n) => n.cod_mcc));

  const cubiertos = new Set(asignaciones.map((a) => a.mcc));
  const sinAsignar: Array<{ cod_mcc: string; descripcion: string | null }> = [];
  for (const n of nuevos) if (!cubiertos.has(n.cod_mcc)) sinAsignar.push(n);

  console.log(`MCCs nuevos sin cat en DB: ${nuevos.length}`);
  console.log(`mapeo definido aquí:       ${asignaciones.length}`);
  console.log(`sin asignar en este script: ${sinAsignar.length}`);
  if (sinAsignar.length) {
    console.log(`--- pendientes manuales ---`);
    for (const s of sinAsignar) console.log(`  ${s.cod_mcc}  ${s.descripcion ?? ''}`);
  }

  const aplicables = asignaciones.filter((a) => nuevosSet.has(a.mcc));
  console.log(`\naplicables (existen en DB sin cat): ${aplicables.length}`);

  if (!apply) {
    for (const a of aplicables) console.log(`  ${a.mcc}  →  ${a.cat?.padEnd(15) ?? '(null)'}  ${a.note}`);
    console.log(`\n(dry-run; agregá --apply para ejecutar)`);
    process.exit(0);
  }

  let ok = 0, miss = 0;
  for (const a of aplicables) {
    if (!a.cat) continue;
    const cid = catId.get(a.cat);
    if (!cid) { miss++; console.log(`MISS_CAT ${a.cat}`); continue; }
    await db.execute(sql`
      UPDATE mcc_catalogo SET categoria_id = ${cid}, updated_at = now()
      WHERE cod_mcc = ${a.mcc}
    `);
    ok++;
  }
  console.log(`\nasignados: ${ok}`);
  console.log(`miss:      ${miss}`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
