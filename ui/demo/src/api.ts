import { TaggerClient, type MovimientoListado, type Categoria } from '@mango/tagger-sdk';

declare global {
  interface Window {
    tagger?: { apiKey: string; baseUrl: string };
  }
}

export const DEMO_USER = 'demo';
export const DEMO_ORIGEN = 'demo';

// Build-time fallback (sólo si scripts/build-demo.mjs lo inyectó).
declare const process: { env: { TAGGER_API_KEY?: string } } | undefined;
const BUILD_TIME_KEY =
  (typeof process !== 'undefined' && process.env.TAGGER_API_KEY) || '';

export interface DemoConfig {
  apiKey: string;
  hasOpenRouter: boolean;
}

// Fetcha config en runtime — server lee env actual.
export async function fetchDemoConfig(): Promise<DemoConfig> {
  try {
    const r = await fetch('/demo/config', { headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error(`config http ${r.status}`);
    const body = (await r.json()) as Partial<DemoConfig>;
    return {
      apiKey: body.apiKey ?? BUILD_TIME_KEY,
      hasOpenRouter: Boolean(body.hasOpenRouter),
    };
  } catch {
    return { apiKey: BUILD_TIME_KEY, hasOpenRouter: false };
  }
}

function readConfig() {
  const fromWindow = typeof window !== 'undefined' ? window.tagger : undefined;
  const baseUrl = fromWindow?.baseUrl ?? window.location.origin;
  const apiKey = fromWindow?.apiKey ?? '';
  return { baseUrl, apiKey };
}

export function makeClient(): TaggerClient {
  const { baseUrl, apiKey } = readConfig();
  return new TaggerClient({ url: baseUrl, apiKey: apiKey || 'placeholder' });
}

export interface UiMov {
  id: string | number;
  t: string;
  s: string;
  amt: number;
  date: string;
  ic: 'qr' | 'bn' | 'shell';
  cat: string;
  catId: string | null;
  recurring: boolean;
  forecast?: boolean;
  confidence?: 'alta' | 'media' | 'baja';
}

function iconFor(name: string, _descripcion: string | null): UiMov['ic'] {
  if (/shell|petrobras|copetrol|puma/i.test(name)) return 'shell';
  return 'qr';
}

export function mapMov(m: MovimientoListado): UiMov {
  const name = m.nombre_comercio || m.descripcion || 'Movimiento';
  return {
    id: m.id,
    t: name,
    s: 'Movimiento',
    amt: m.monto != null ? Number.parseFloat(m.monto) : 0,
    date: m.created_at.slice(0, 10),
    ic: iconFor(name, m.descripcion ?? null),
    cat: m.categoria?.slug ?? 'sin-categoria',
    catId: m.categoria?.id ?? null,
    recurring: false,
  };
}

export async function fetchAll(client: TaggerClient): Promise<{
  movs: UiMov[];
  categorias: Categoria[];
}> {
  const [items, categorias] = await Promise.all([
    client.movimientos.listar({ limit: 200, origen: DEMO_ORIGEN }),
    client.categorias.listar(),
  ]);
  const movs = items.map(mapMov);
  return { movs, categorias };
}
