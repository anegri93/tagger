import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

interface PatronNuevo {
  tipo: 'contiene' | 'regex' | 'prefijo' | 'literal';
  valor: string;
  cat: string;
  prio: number;
  desc: string;
}

// Patrones para mejorar cobertura, basados en top tokens en sin_cat
const patrones: PatronNuevo[] = [
  // Farmacia
  { tipo: 'regex', valor: '\\bFCIA\\b', cat: 'farmacia', prio: 20, desc: 'farmacia abrev' },

  // Salud
  { tipo: 'contiene', valor: 'CONSULTORIO', cat: 'salud', prio: 20, desc: 'consultorio médico' },
  { tipo: 'contiene', valor: 'SUPLEMENTOS', cat: 'salud', prio: 25, desc: 'suplementos' },
  { tipo: 'regex', valor: '\\bDRA?\\b', cat: 'salud', prio: 30, desc: 'Dr/Dra' },

  // Restaurante
  { tipo: 'contiene', valor: 'HAVANNA', cat: 'restaurante', prio: 25, desc: 'Havanna café' },
  { tipo: 'contiene', valor: 'PIZZAS', cat: 'restaurante', prio: 25, desc: 'pizzas plural' },

  // Servicios
  { tipo: 'contiene', valor: 'CERRAJERIA', cat: 'servicios', prio: 25, desc: 'cerrajería' },
  { tipo: 'contiene', valor: 'LAVANDERIA', cat: 'servicios', prio: 25, desc: 'lavandería' },
  { tipo: 'contiene', valor: 'REFRIGERACION', cat: 'servicios', prio: 25, desc: 'refrigeración' },
  { tipo: 'contiene', valor: 'EMBALAJES', cat: 'servicios', prio: 25, desc: 'embalajes' },
  { tipo: 'contiene', valor: 'IMPORT', cat: 'servicios', prio: 30, desc: 'importadora' },
  { tipo: 'contiene', valor: 'FUNDACION', cat: 'servicios', prio: 30, desc: 'fundación/ONG' },
  { tipo: 'contiene', valor: 'COBRANZAS', cat: 'financiero', prio: 25, desc: 'cobranzas' },

  // Tecnología
  { tipo: 'contiene', valor: 'CELULARES', cat: 'tecnologia', prio: 25, desc: 'celulares' },

  // Ropa
  { tipo: 'contiene', valor: 'CONFECCIONES', cat: 'ropa', prio: 25, desc: 'confecciones' },
  { tipo: 'contiene', valor: 'ROPERIA', cat: 'ropa', prio: 25, desc: 'ropería' },

  // Entretenimiento
  { tipo: 'contiene', valor: 'JUGUETERIA', cat: 'entretenimiento', prio: 25, desc: 'jugueterías' },
  { tipo: 'contiene', valor: 'COTILLON', cat: 'entretenimiento', prio: 25, desc: 'cotillón' },
  { tipo: 'contiene', valor: 'ARTESANIA', cat: 'entretenimiento', prio: 25, desc: 'artesanía' },

  // Supermercado
  { tipo: 'contiene', valor: 'VARIEDADES', cat: 'supermercado', prio: 30, desc: 'variedades' },

  // Transporte
  { tipo: 'contiene', valor: 'NEUMATICOS', cat: 'transporte', prio: 25, desc: 'neumáticos' },

  // Floreria (cat fría, ahora activa)
  { tipo: 'contiene', valor: 'FLORERIA', cat: 'floreria', prio: 25, desc: 'florería' },

  // Religioso (cat fría)
  { tipo: 'contiene', valor: 'PARROQUIA', cat: 'religioso', prio: 25, desc: 'parroquia' },

  // Tabaco (cat fría)
  { tipo: 'contiene', valor: 'VAPE', cat: 'tabaco', prio: 25, desc: 'vape' },
  { tipo: 'contiene', valor: 'CANNASHOP', cat: 'tabaco', prio: 25, desc: 'cannashop' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const cats = await db.execute(sql`SELECT id, slug FROM categorias`);
  const catId = new Map<string, string>();
  for (const r of cats.rows as Array<{ id: string; slug: string }>) catId.set(r.slug, r.id);

  let okIns = 0, skipDup = 0, errors: string[] = [];
  for (const p of patrones) {
    const cid = catId.get(p.cat);
    if (!cid) { errors.push(`cat missing: ${p.cat}`); continue; }
    const exists = await db.execute(sql`
      SELECT 1 FROM patrones
      WHERE tipo = ${p.tipo}::patron_tipo AND valor = ${p.valor} AND categoria_id = ${cid}
      LIMIT 1
    `);
    if (exists.rows.length > 0) { skipDup++; continue; }
    if (!apply) { okIns++; continue; }
    await db.execute(sql`
      INSERT INTO patrones (tipo, valor, categoria_id, prioridad, descripcion, fuente)
      VALUES (${p.tipo}::patron_tipo, ${p.valor}, ${cid}, ${p.prio}, ${p.desc}, 'manual'::patron_fuente)
    `);
    okIns++;
  }

  console.log(`a insertar: ${okIns}`);
  console.log(`duplicados (skip): ${skipDup}`);
  if (errors.length) console.log('errors:', errors);
  if (!apply) {
    console.log('\n(dry-run; agregá --apply)');
    process.exit(0);
  }
  const total = await db.execute(sql`SELECT count(*)::int AS c FROM patrones`);
  console.log(`\ntotal patrones ahora: ${(total.rows[0] as { c: number }).c}`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
