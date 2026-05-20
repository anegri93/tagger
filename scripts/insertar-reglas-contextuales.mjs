#!/usr/bin/env node
// Inserta reglas globales contextuales (palabras clave) con prioridad 3
// para que ganen sobre regex como ^MANGO\b (prio 5).
//
// Uso: API_KEY=xxx node scripts/insertar-reglas-contextuales.mjs [API_URL]

const API_URL = process.argv[2] || process.env.API_URL || 'https://tagger.n8negri.xyz';
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('falta API_KEY');
  process.exit(1);
}

// (palabra clave, categoria_slug)
const REGLAS = [
  // Hogar — incluye alquiler de vivienda (mismo que inmobiliaria en contexto familiar)
  ['alquiler', 'hogar'],
  ['expensas', 'hogar'],
  ['condominio', 'hogar'],
  ['mudanza', 'hogar'],
  // Servicios
  ['luz electrica', 'servicios'],
  ['electricidad', 'servicios'],
  ['factura agua', 'servicios'],
  ['factura luz', 'servicios'],
  ['factura internet', 'servicios'],
  ['factura gas', 'servicios'],
  ['ande', 'servicios'],
  ['essap', 'servicios'],
  ['copaco', 'servicios'],
  // Restaurante
  ['almuerzo', 'restaurante'],
  ['cena', 'restaurante'],
  ['desayuno', 'restaurante'],
  // Supermercado / alimentacion
  ['mandado', 'supermercado'],
  ['mercado', 'supermercado'],
  ['despensa', 'alimentacion'],
  // Transporte
  ['taxi', 'transporte'],
  ['uber', 'transporte'],
  ['bolt', 'transporte'],
  ['pasaje', 'transporte'],
  // Combustible
  ['nafta', 'combustible'],
  ['gasoil', 'combustible'],
  // Salud
  ['medicamento', 'farmacia'],
  ['remedio', 'farmacia'],
  ['consulta medica', 'salud'],
  ['doctor', 'salud'],
  ['dentista', 'salud'],
  // Educacion
  ['matricula', 'educacion'],
  ['cuota colegio', 'educacion'],
  ['curso', 'educacion'],
  // Entretenimiento
  ['netflix', 'entretenimiento'],
  ['spotify', 'entretenimiento'],
  ['disney', 'entretenimiento'],
  ['cine', 'entretenimiento'],
  // Otros
  ['regalo', 'otros'],
  ['cumpleanos', 'otros'],
];

let ok = 0,
  skip = 0,
  fail = 0;

for (const [valor, slug] of REGLAS) {
  try {
    const r = await fetch(`${API_URL}/reglas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        scope: 'global',
        tipo: 'contiene',
        valor,
        categoria_slug: slug,
        prioridad: 3,
        origen: 'contextual',
        descripcion: `palabra clave: ${valor} → ${slug}`,
      }),
    });
    if (r.ok) {
      ok++;
      process.stdout.write('.');
    } else if (r.status === 409) {
      skip++;
      process.stdout.write('o'); // ya existe
    } else {
      fail++;
      const t = await r.text();
      console.log(`\nfail ${valor} → ${slug}: ${t.slice(0, 100)}`);
    }
  } catch (e) {
    fail++;
    console.log(`\nfail ${valor}: ${e.message}`);
  }
}

console.log(`\n\nok=${ok} skip(ya existe)=${skip} fail=${fail}`);
