import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { sugerenciasPatronesRoute } from './sugerencias-patrones.js';
import type { PatronWriter } from '../../db/repos/patrones.js';

function fakeDb() {
  return {
    execute: vi.fn(async () => ({ rows: [] })),
  };
}

function fakeWriter(): PatronWriter {
  return {
    listar: vi.fn(async () => []),
    obtener: vi.fn(async () => null),
    crear: vi.fn(async (input) => ({
      id: `p_${input.valor}`,
      tipo: input.tipo,
      valor: input.valor,
      categoriaId: 'cat',
      categoriaSlug: input.categoriaSlug,
      prioridad: input.prioridad ?? 100,
      activo: true,
      fuente: 'manual',
      descripcion: input.descripcion ?? null,
    })),
    actualizar: vi.fn(async () => null),
    eliminar: vi.fn(async () => true),
  };
}

describe('sugerencias-patrones route', () => {
  it('GET devuelve lista', async () => {
    const app = Fastify();
    await app.register(sugerenciasPatronesRoute(fakeDb() as never, fakeWriter()));
    const r = await app.inject({ method: 'GET', url: '/patrones/sugerencias' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toEqual([]);
  });

  it('POST aplicar crea N patrones', async () => {
    const w = fakeWriter();
    const app = Fastify();
    await app.register(sugerenciasPatronesRoute(fakeDb() as never, w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias/aplicar',
      payload: {
        items: [
          { tipo: 'contiene', valor: 'JOYERIA', categoria_slug: 'ropa' },
          { tipo: 'contiene', valor: 'FERRETERIA', categoria_slug: 'hogar' },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().creados).toBe(2);
    expect(w.crear).toHaveBeenCalledTimes(2);
  });

  it('POST aplicar reporta errores parciales', async () => {
    const w = fakeWriter();
    let call = 0;
    w.crear = vi.fn(async (input) => {
      call++;
      if (call === 2) throw new Error('patron_invalido');
      return {
        id: 'x',
        tipo: input.tipo,
        valor: input.valor,
        categoriaId: 'c',
        categoriaSlug: input.categoriaSlug,
        prioridad: 35,
        activo: true,
        fuente: 'manual',
        descripcion: null,
      };
    });
    const app = Fastify();
    await app.register(sugerenciasPatronesRoute(fakeDb() as never, w));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias/aplicar',
      payload: {
        items: [
          { tipo: 'contiene', valor: 'A', categoria_slug: 'x' },
          { tipo: 'regex', valor: '[bad', categoria_slug: 'x' },
        ],
      },
    });
    expect(r.json().creados).toBe(1);
    expect(r.json().errores).toHaveLength(1);
    expect(r.json().errores[0].error).toBe('patron_invalido');
  });

  it('POST 400 si items vacío', async () => {
    const app = Fastify();
    await app.register(sugerenciasPatronesRoute(fakeDb() as never, fakeWriter()));
    const r = await app.inject({
      method: 'POST',
      url: '/patrones/sugerencias/aplicar',
      payload: { items: [] },
    });
    expect(r.statusCode).toBe(400);
  });
});
