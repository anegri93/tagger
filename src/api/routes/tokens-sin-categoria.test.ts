import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { tokensSinCategoriaRoute, tokenizar } from './tokens-sin-categoria.js';

describe('tokenizar', () => {
  it('normaliza, splitea, filtra cortos y stopwords', () => {
    expect(tokenizar('Joyeria Rubi S.A.')).toEqual(['JOYERIA', 'RUBI']);
    expect(tokenizar('BIGGIE EXPRESS S A')).toEqual(['BIGGIE', 'EXPRESS']);
    expect(tokenizar('LA CASA DEL POLLO')).toEqual(['CASA', 'POLLO']);
  });

  it('dedupe ocurre en el caller, tokens repetidos quedan', () => {
    expect(tokenizar('PAN PAN PAN')).toEqual(['PAN', 'PAN', 'PAN']);
  });
});

function fakeDb(rows: Array<{ id: string; nombre: string }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
  };
}

describe('tokens-sin-categoria route', () => {
  it('ranking por frecuencia descendente', async () => {
    const db = fakeDb([
      { id: '1', nombre: 'JOYERIA RUBI' },
      { id: '2', nombre: 'JOYERIA PEREZ' },
      { id: '3', nombre: 'PANADERIA SAN PEDRO' },
    ]);
    const app = Fastify();
    await app.register(tokensSinCategoriaRoute(db as never));
    const r = await app.inject({ method: 'GET', url: '/catalogo/tokens-sin-categoria' });
    const body = r.json();
    expect(body.total_sin_categoria).toBe(3);
    expect(body.items[0].token).toBe('JOYERIA');
    expect(body.items[0].freq).toBe(2);
  });

  it('respeta limit', async () => {
    const db = fakeDb([{ id: '1', nombre: 'A B C D E F' }]);
    const app = Fastify();
    await app.register(tokensSinCategoriaRoute(db as never));
    const r = await app.inject({
      method: 'GET',
      url: '/catalogo/tokens-sin-categoria?limit=2',
    });
    expect(r.json().items.length).toBeLessThanOrEqual(2);
  });

  it('ejemplos limitados a 5', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      nombre: `JOYERIA EJEMPLO ${i}`,
    }));
    const db = fakeDb(rows);
    const app = Fastify();
    await app.register(tokensSinCategoriaRoute(db as never));
    const r = await app.inject({ method: 'GET', url: '/catalogo/tokens-sin-categoria' });
    const joyeria = r.json().items.find((t: { token: string }) => t.token === 'JOYERIA');
    expect(joyeria.freq).toBe(10);
    expect(joyeria.ejemplos.length).toBe(5);
  });

  it('lista vacía si nada sin categoría', async () => {
    const db = fakeDb([]);
    const app = Fastify();
    await app.register(tokensSinCategoriaRoute(db as never));
    const r = await app.inject({ method: 'GET', url: '/catalogo/tokens-sin-categoria' });
    expect(r.json().items).toEqual([]);
    expect(r.json().total_sin_categoria).toBe(0);
  });

  void vi;
});
