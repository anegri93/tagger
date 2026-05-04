import { describe, it, expect, vi } from 'vitest';
import { crearCapaRegex, type ReglaCargada } from './regex.js';

const REGLAS: ReglaCargada[] = [
  { id: 'r1', patron: 'BIGGIE', categoriaId: 'cat-supermercado', prioridad: 10 },
  { id: 'r2', patron: 'COPETROL|SHELL', categoriaId: 'cat-combustible', prioridad: 20 },
  { id: 'r3', patron: 'PUNTO\\s+FARMA', categoriaId: 'cat-farmacia', prioridad: 30 },
];

function loaderFijo(reglas: ReglaCargada[]) {
  return { cargar: vi.fn().mockResolvedValue(reglas) };
}

describe('capa regex', () => {
  it('match BIGGIE → supermercado', async () => {
    const capa = crearCapaRegex(loaderFijo(REGLAS));
    const r = await capa.evaluar('Compra Biggie sucursal centro');
    expect(r?.categoriaId).toBe('cat-supermercado');
    expect(r?.fuente).toBe('regex');
    expect(r?.confianza).toBe(0.95);
    expect(r?.evidencia.regla_id).toBe('r1');
  });

  it('no match devuelve null', async () => {
    const capa = crearCapaRegex(loaderFijo(REGLAS));
    expect(await capa.evaluar('TEXTO ALEATORIO')).toBeNull();
  });

  it('respeta prioridad (menor número primero)', async () => {
    const reglas: ReglaCargada[] = [
      { id: 'low', patron: 'BIGGIE', categoriaId: 'wrong', prioridad: 100 },
      { id: 'high', patron: 'BIGGIE', categoriaId: 'right', prioridad: 1 },
    ];
    const capa = crearCapaRegex(loaderFijo(reglas));
    const r = await capa.evaluar('BIGGIE Asunción');
    expect(r?.categoriaId).toBe('right');
    expect(r?.evidencia.regla_id).toBe('high');
  });

  it('cache TTL evita recargar dentro de ventana', async () => {
    const loader = loaderFijo(REGLAS);
    let t = 0;
    const capa = crearCapaRegex(loader, () => t);
    await capa.evaluar('BIGGIE');
    t = 30_000;
    await capa.evaluar('BIGGIE');
    expect(loader.cargar).toHaveBeenCalledTimes(1);
  });

  it('cache expira pasado TTL', async () => {
    const loader = loaderFijo(REGLAS);
    let t = 0;
    const capa = crearCapaRegex(loader, () => t);
    await capa.evaluar('BIGGIE');
    t = 60_001;
    await capa.evaluar('BIGGIE');
    expect(loader.cargar).toHaveBeenCalledTimes(2);
  });

  it('invalidar fuerza recarga', async () => {
    const loader = loaderFijo(REGLAS);
    const capa = crearCapaRegex(loader);
    await capa.evaluar('BIGGIE');
    capa.invalidar();
    await capa.evaluar('BIGGIE');
    expect(loader.cargar).toHaveBeenCalledTimes(2);
  });

  it('patrón inválido se ignora sin throw', async () => {
    const reglas: ReglaCargada[] = [
      { id: 'bad', patron: '[invalid', categoriaId: 'x', prioridad: 1 },
      { id: 'ok', patron: 'BIGGIE', categoriaId: 'cat-supermercado', prioridad: 2 },
    ];
    const capa = crearCapaRegex(loaderFijo(reglas));
    const r = await capa.evaluar('BIGGIE');
    expect(r?.categoriaId).toBe('cat-supermercado');
  });

  it('input vacío devuelve null', async () => {
    const capa = crearCapaRegex(loaderFijo(REGLAS));
    expect(await capa.evaluar('')).toBeNull();
  });

  it('regla MANGO P2P → transferencia', async () => {
    const reglas: ReglaCargada[] = [
      { id: 'mango', patron: '^MANGO\\b', categoriaId: 'cat-transfer', prioridad: 5 },
    ];
    const capa = crearCapaRegex(loaderFijo(reglas));
    const r = await capa.evaluar('MANGO PEREZ JUAN');
    expect(r?.categoriaId).toBe('cat-transfer');
  });

  it('regla AZAR → azar', async () => {
    const reglas: ReglaCargada[] = [
      {
        id: 'azar',
        patron: '\\b(AZAR|SLOTS?|TRAGAMONEDA|CASINO)\\b',
        categoriaId: 'cat-azar',
        prioridad: 10,
      },
    ];
    const capa = crearCapaRegex(loaderFijo(reglas));
    expect((await capa.evaluar('AZAR LATINO'))?.categoriaId).toBe('cat-azar');
    expect((await capa.evaluar('SLOTS DEL SOL'))?.categoriaId).toBe('cat-azar');
  });
});
