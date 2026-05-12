import { describe, it, expect, vi } from 'vitest';
import { crearCapaPatrones, type PatronCargado } from './patrones.js';

function loaderFijo(reglas: PatronCargado[]) {
  return { cargar: vi.fn().mockResolvedValue(reglas) };
}

describe('capa patrones', () => {
  it('match tipo=contiene → fuente=contiene conf=0.9', async () => {
    const reglas: PatronCargado[] = [
      {
        id: 'p1',
        tipo: 'contiene',
        valor: 'CIAL',
        categoriaId: 'cat-super',
        prioridad: 20,
      },
    ];
    const capa = crearCapaPatrones(loaderFijo(reglas));
    const r = await capa.evaluar('CIAL.VIRGEN DEL ROSA');
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.fuente).toBe('contiene');
    expect(r?.confianza).toBe(0.8);
  });

  it('match tipo=literal → fuente=literal conf=0.95', async () => {
    const reglas: PatronCargado[] = [
      { id: 'p1', tipo: 'literal', valor: 'BIGGIE', categoriaId: 'cat-super', prioridad: 1 },
    ];
    const capa = crearCapaPatrones(loaderFijo(reglas));
    const r = await capa.evaluar('BIGGIE');
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.fuente).toBe('literal');
    expect(r?.confianza).toBe(0.95);
    expect(await capa.evaluar('BIGGIE EXPRESS')).toBeNull();
  });

  it('match tipo=prefijo → fuente=prefijo conf=0.9', async () => {
    const reglas: PatronCargado[] = [
      { id: 'p1', tipo: 'prefijo', valor: 'SUPER', categoriaId: 'cat-super', prioridad: 1 },
    ];
    const capa = crearCapaPatrones(loaderFijo(reglas));
    const r = await capa.evaluar('SUPER SEIS');
    expect(r?.categoriaId).toBe('cat-super');
    expect(r?.fuente).toBe('prefijo');
    expect(r?.confianza).toBe(0.9);
    expect(await capa.evaluar('FARMA SUPER')).toBeNull();
  });

  it('match tipo=regex → fuente=regex conf=0.95', async () => {
    const reglas: PatronCargado[] = [
      {
        id: 'p1',
        tipo: 'regex',
        valor: '\\b(MERCADO|HIPER)\\b',
        categoriaId: 'cat-super',
        prioridad: 1,
      },
    ];
    const capa = crearCapaPatrones(loaderFijo(reglas));
    const r = await capa.evaluar('HIPER LUISITO');
    expect(r?.fuente).toBe('regex');
    expect(r?.confianza).toBe(0.95);
    expect((await capa.evaluar('MERCADO CENTRAL'))?.categoriaId).toBe('cat-super');
  });

  it('respeta prioridad ASC', async () => {
    const reglas: PatronCargado[] = [
      { id: 'low', tipo: 'contiene', valor: 'CAFE', categoriaId: 'wrong', prioridad: 100 },
      { id: 'high', tipo: 'contiene', valor: 'CAFE', categoriaId: 'right', prioridad: 1 },
    ];
    const capa = crearCapaPatrones(loaderFijo(reglas));
    const r = await capa.evaluar('CAFE MARTINEZ');
    expect(r?.categoriaId).toBe('right');
  });

  it('regex inválida no rompe loop', async () => {
    const reglas: PatronCargado[] = [
      { id: 'bad', tipo: 'regex', valor: '[invalid', categoriaId: 'x', prioridad: 1 },
      { id: 'ok', tipo: 'contiene', valor: 'BIGGIE', categoriaId: 'cat-super', prioridad: 2 },
    ];
    const capa = crearCapaPatrones(loaderFijo(reglas));
    const r = await capa.evaluar('BIGGIE EXPRESS');
    expect(r?.categoriaId).toBe('cat-super');
  });

  it('input vacío devuelve null', async () => {
    const capa = crearCapaPatrones(loaderFijo([]));
    expect(await capa.evaluar('')).toBeNull();
  });

  it('tabla vacía devuelve null', async () => {
    const capa = crearCapaPatrones(loaderFijo([]));
    expect(await capa.evaluar('CIAL VIRGEN')).toBeNull();
  });

  it('cache TTL 60s evita recarga', async () => {
    const loader = loaderFijo([
      { id: 'p1', tipo: 'contiene', valor: 'X', categoriaId: 'c', prioridad: 1 },
    ]);
    let t = 0;
    const capa = crearCapaPatrones(loader, () => t);
    await capa.evaluar('X');
    t = 30_000;
    await capa.evaluar('X');
    expect(loader.cargar).toHaveBeenCalledTimes(1);
  });

  it('cache expira pasado TTL', async () => {
    const loader = loaderFijo([
      { id: 'p1', tipo: 'contiene', valor: 'X', categoriaId: 'c', prioridad: 1 },
    ]);
    let t = 0;
    const capa = crearCapaPatrones(loader, () => t);
    await capa.evaluar('X');
    t = 60_001;
    await capa.evaluar('X');
    expect(loader.cargar).toHaveBeenCalledTimes(2);
  });

  it('invalidar fuerza recarga', async () => {
    const loader = loaderFijo([
      { id: 'p1', tipo: 'contiene', valor: 'X', categoriaId: 'c', prioridad: 1 },
    ]);
    const capa = crearCapaPatrones(loader);
    await capa.evaluar('X');
    capa.invalidar();
    await capa.evaluar('X');
    expect(loader.cargar).toHaveBeenCalledTimes(2);
  });
});
