// Smoke test del SDK contra un server tagger real.
// Ejerce TODOS los módulos: lectura, write con cleanup, errores tipados.
//
// Uso:
//   pnpm build && API_KEY=xxx node scripts/smoke.mjs
//   API_KEY=xxx TAGGER_URL=http://localhost:3000 node scripts/smoke.mjs

import {
  TaggerClient,
  ValidationError,
  NotFoundError,
  AuthError,
  ConflictError,
} from '../dist/index.js';

const apiKey = process.env.API_KEY;
const url = process.env.TAGGER_URL ?? 'https://tagger.n8negri.xyz';
if (!apiKey) {
  console.error('falta API_KEY env var');
  process.exit(1);
}

const tagger = new TaggerClient({ url, apiKey });

let pass = 0,
  fail = 0;
const failures = [];

async function check(name, fn) {
  process.stdout.write(`  ${name.padEnd(50)} `);
  try {
    await fn();
    console.log('✓');
    pass++;
  } catch (err) {
    console.log('✗');
    fail++;
    failures.push({ name, error: err });
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg ?? 'expect falló');
}

console.log(`\nSmoke SDK · server: ${url}\n`);

// ============== health ==============
console.log('-- health --');
let h;
await check('health()', async () => {
  h = await tagger.health();
  expect(h.status === 'ok' || h.status === 'degraded', `status raro: ${h.status}`);
  expect(h.db === 'ok' || h.db === 'down', `db raro: ${h.db}`);
});

// ============== categorias ==============
console.log('\n-- categorias --');
let cats = [];
await check('listar()', async () => {
  cats = await tagger.categorias.listar();
  expect(cats.length > 0, 'sin categorías');
});
await check('listar()[0] tiene id/slug/nombre', async () => {
  const c = cats[0];
  expect(typeof c.id === 'string' && typeof c.slug === 'string' && typeof c.nombre === 'string');
});

let testCatSlug = `sdk_test_${Date.now()}`;
let testCatId;
await check('crear({slug, nombre})', async () => {
  const c = await tagger.categorias.crear({
    slug: testCatSlug,
    nombre: 'SDK Test',
    descripcion: 'creada por smoke test SDK',
  });
  testCatId = c.id;
  expect(c.slug === testCatSlug);
});
await check('usage(slug) devuelve 0/0/0', async () => {
  const u = await tagger.categorias.usage(testCatSlug);
  expect(u.movimientos === 0 && u.mcc === 0 && u.comercios === 0);
});
await check('usage(UUID) también funciona', async () => {
  const u = await tagger.categorias.usage(testCatId);
  expect(u.movimientos === 0);
});
await check('actualizar(slug, {nombre})', async () => {
  const c = await tagger.categorias.actualizar(testCatSlug, { nombre: 'SDK Test (renamed)' });
  expect(c.nombre === 'SDK Test (renamed)');
});
await check('eliminar(slug)', async () => {
  await tagger.categorias.eliminar(testCatSlug);
});

// ============== reglas ==============
console.log('\n-- reglas --');
await check('listar({scope: "global"}) >0', async () => {
  const r = await tagger.reglas.listar({ scope: 'global' });
  expect(r.length > 0);
});

let testReglaId;
await check('crear regla global "contiene"', async () => {
  const r = await tagger.reglas.crear({
    scope: 'global',
    tipo: 'contiene',
    valor: `SDK_TEST_${Date.now()}`,
    categoriaSlug: 'otros',
    prioridad: 999,
    origen: 'sdk-smoke',
  });
  testReglaId = r.id;
});
await check('actualizar(id, {activo: false})', async () => {
  const r = await tagger.reglas.actualizar(testReglaId, { activo: false });
  expect(r.activo === false);
});
await check('eliminar(id)', async () => {
  await tagger.reglas.eliminar(testReglaId);
});
await check('sugerenciasGlobales()', async () => {
  const sug = await tagger.reglas.sugerenciasGlobales({ minUsuarios: 2, minTotal: 1 });
  expect(Array.isArray(sug));
});

// ============== mcc ==============
console.log('\n-- mcc --');
await check('listar()', async () => {
  const m = await tagger.mcc.listar();
  expect(m.length > 0);
});
await check('listar({sinCategoria: true})', async () => {
  const m = await tagger.mcc.listar({ sinCategoria: true });
  expect(Array.isArray(m));
});

// ============== marcas ==============
console.log('\n-- marcas --');
await check('listar()', async () => {
  const m = await tagger.marcas.listar();
  expect(Array.isArray(m));
});

// ============== comercios ==============
console.log('\n-- comercios --');
await check('listar({limit: 5})', async () => {
  const r = await tagger.comercios.listar({ limit: 5 });
  expect('items' in r && 'total' in r);
});

// ============== movimientos ==============
console.log('\n-- movimientos --');
let movId;
await check('categorizar (transferencia)', async () => {
  const r = await tagger.movimientos.categorizar({
    nombreBancard: `MANGO - SDK SMOKE ${Date.now()}`,
    monto: 1000,
    origen: 'sdk_smoke',
  });
  movId = r.movimientoId;
  expect(r.categoria?.slug === 'transferencia', `esperaba transferencia, vino ${r.categoria?.slug}`);
});
await check('obtener(id)', async () => {
  const m = await tagger.movimientos.obtener(movId);
  expect(m.id === movId);
});
await check('corregir → memoria por-usuario', async () => {
  const tecno = (await tagger.categorias.listar()).find((c) => c.slug === 'tecnologia');
  expect(tecno, 'no hay cat tecnologia');
  await tagger.movimientos.corregir({
    movimientoId: movId,
    categoriaIdNueva: tecno.id,
    usuario: 'sdk_smoke',
  });
});
await check('reprocesar(id)', async () => {
  const r = await tagger.movimientos.reprocesar(movId);
  expect(r.movimientoId === movId);
});

// ============== stats ==============
console.log('\n-- stats --');
await check('pipeline({ventana: "24h"})', async () => {
  const s = await tagger.stats.pipeline({ ventana: '24h' });
  expect(typeof s.total === 'number');
});

// ============== test-batch (solo lectura) ==============
console.log('\n-- testBatch --');
await check('listar()', async () => {
  const r = await tagger.testBatch.listar();
  expect(Array.isArray(r));
});

// ============== errores tipados ==============
console.log('\n-- errores --');
await check('ValidationError en categorizar inválido', async () => {
  try {
    await tagger.movimientos.categorizar({});
    throw new Error('debió tirar');
  } catch (err) {
    if (!(err instanceof ValidationError)) throw new Error(`tipo: ${err?.constructor?.name}`);
  }
});
await check('NotFoundError al obtener mov inexistente', async () => {
  try {
    await tagger.movimientos.obtener('00000000-0000-0000-0000-000000000000');
    throw new Error('debió tirar');
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw new Error(`tipo: ${err?.constructor?.name}`);
  }
});
await check('AuthError con key mala', async () => {
  const fake = new TaggerClient({ url, apiKey: 'key-invalida-1234567890' });
  try {
    await fake.health();
    throw new Error('debió tirar');
  } catch (err) {
    if (!(err instanceof AuthError)) {
      // health puede no estar autenticado; intentar endpoint protegido
      try {
        await fake.categorias.crear({ slug: 'x', nombre: 'x' });
        throw new Error('debió tirar 2');
      } catch (err2) {
        if (!(err2 instanceof AuthError)) {
          throw new Error(`tipo: ${err2?.constructor?.name}`);
        }
      }
    }
  }
});
await check('ConflictError al crear slug duplicado', async () => {
  try {
    await tagger.categorias.crear({ slug: 'restaurante', nombre: 'duplicado' });
    throw new Error('debió tirar');
  } catch (err) {
    if (!(err instanceof ConflictError)) throw new Error(`tipo: ${err?.constructor?.name}`);
  }
});

// ============== summary ==============
console.log(`\n${'='.repeat(60)}`);
console.log(`PASS ${pass} · FAIL ${fail}`);
if (fail > 0) {
  console.log('\nFallas:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`     ${f.error?.message ?? f.error}`);
    if (f.error?.body) console.log(`     body: ${JSON.stringify(f.error.body)}`);
  }
  process.exit(1);
}
process.exit(0);
