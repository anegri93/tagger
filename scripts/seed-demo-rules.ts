// Idempotent: agrega/actualiza reglas globales necesarias para el demo UI.
// Usa la HTTP API para que el caché LRU de reglas del server se invalide.
// Run: pnpm tsx scripts/seed-demo-rules.ts

import 'dotenv/config';

const BASE_URL = process.env.TAGGER_URL ?? 'http://127.0.0.1:3000';
const API_KEY = process.env.API_KEY ?? '';

interface Regla {
  tipo: 'literal' | 'contiene' | 'regex';
  valor: string;
  categoria_slug: string;
  prioridad: number;
  descripcion: string;
}

const REGLAS: Regla[] = [
  {
    tipo: 'contiene',
    valor: 'TRANSFERENCIA A',
    categoria_slug: 'transferencia',
    prioridad: 50,
    descripcion: 'Demo UI: transferencias salientes',
  },
  {
    tipo: 'contiene',
    valor: 'PAGO SERVICIO',
    categoria_slug: 'servicios',
    prioridad: 50,
    descripcion: 'Demo UI: pagos de servicios',
  },
];

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'x-api-key': API_KEY,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await r.json().catch(() => null)) as unknown;
  return { status: r.status, body };
}

async function main() {
  if (!API_KEY) {
    console.error('Falta API_KEY en .env');
    process.exit(1);
  }
  const health = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Server no responde en ${BASE_URL}. Iniciá pnpm dev primero.`);
    process.exit(1);
  }

  // Lista global existentes para detectar duplicados.
  const list = await api('/reglas?scope=global');
  const existing = (list.body as { items?: Array<{ id: string; tipo: string; valor: string }> } | null)?.items ?? [];

  for (const r of REGLAS) {
    const match = existing.find(
      (e) => e.tipo === r.tipo && e.valor.toUpperCase() === r.valor.toUpperCase(),
    );
    if (match) {
      // PATCH no-op para forzar invalidación del caché LRU del server.
      await api(`/reglas/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: true }),
      });
      console.log(`↻ existe + cache invalidado ${r.tipo} "${r.valor}" → ${r.categoria_slug} (${match.id})`);
      continue;
    }
    const res = await api('/reglas', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'global',
        tipo: r.tipo,
        valor: r.valor,
        categoria_slug: r.categoria_slug,
        prioridad: r.prioridad,
        descripcion: r.descripcion,
      }),
    });
    if (res.status >= 200 && res.status < 300) {
      const id = (res.body as { id?: string } | null)?.id ?? '?';
      console.log(`✓ creada ${r.tipo} "${r.valor}" → ${r.categoria_slug} (${id})`);
    } else {
      console.error(`✗ fallo ${r.tipo} "${r.valor}": ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  console.log('listo. Caché LRU invalidado por el server.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
