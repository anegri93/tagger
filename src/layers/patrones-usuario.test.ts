import { describe, it, expect, vi } from 'vitest';
import { crearCapaPatronesUsuario } from './patrones-usuario.js';
import type { PatronUsuarioCargado } from '../db/repos/patrones-usuario.js';

function loader(reglas: PatronUsuarioCargado[]) {
  return { porUsuario: vi.fn().mockResolvedValue(reglas) };
}

describe('crearCapaPatronesUsuario', () => {
  it('devuelve null sin usuario', async () => {
    const capa = crearCapaPatronesUsuario(loader([]));
    expect(await capa.evaluar({ nombreBancard: 'STRIPE' }, null)).toBeNull();
  });

  it('devuelve null si no hay reglas', async () => {
    const capa = crearCapaPatronesUsuario(loader([]));
    expect(await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1')).toBeNull();
  });

  it('matchea contiene case-insensitive', async () => {
    const capa = crearCapaPatronesUsuario(
      loader([
        {
          id: 'p1',
          usuario: 'u1',
          tipo: 'contiene',
          valor: 'STRIPE',
          categoriaId: 'cat-soft',
          prioridad: 100,
        },
      ]),
    );
    const r = await capa.evaluar({ nombreBancard: 'stripe*sub' }, 'u1');
    expect(r?.categoriaId).toBe('cat-soft');
    expect(r?.fuente).toBe('contiene');
  });

  it('matchea regex', async () => {
    const capa = crearCapaPatronesUsuario(
      loader([
        {
          id: 'p1',
          usuario: 'u1',
          tipo: 'regex',
          valor: '^NETFLIX',
          categoriaId: 'cat-ent',
          prioridad: 100,
        },
      ]),
    );
    const r = await capa.evaluar({ nombreBancard: 'NETFLIX.COM' }, 'u1');
    expect(r?.categoriaId).toBe('cat-ent');
    expect(r?.fuente).toBe('regex');
  });

  it('regex inválido no matchea ni rompe', async () => {
    const capa = crearCapaPatronesUsuario(
      loader([
        {
          id: 'p1',
          usuario: 'u1',
          tipo: 'regex',
          valor: '[bad',
          categoriaId: 'cat-x',
          prioridad: 100,
        },
      ]),
    );
    expect(await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1')).toBeNull();
  });

  it('respeta prioridad: menor primero', async () => {
    const capa = crearCapaPatronesUsuario(
      loader([
        {
          id: 'p2',
          usuario: 'u1',
          tipo: 'contiene',
          valor: 'STRIPE',
          categoriaId: 'cat-b',
          prioridad: 200,
        },
        {
          id: 'p1',
          usuario: 'u1',
          tipo: 'contiene',
          valor: 'STRIPE',
          categoriaId: 'cat-a',
          prioridad: 50,
        },
      ]),
    );
    const r = await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1');
    expect(r?.categoriaId).toBe('cat-a');
  });

  it('cache por usuario invalidable', async () => {
    const lk = loader([
      {
        id: 'p1',
        usuario: 'u1',
        tipo: 'contiene',
        valor: 'STRIPE',
        categoriaId: 'cat-a',
        prioridad: 100,
      },
    ]);
    const capa = crearCapaPatronesUsuario(lk);
    await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1');
    await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1');
    expect(lk.porUsuario).toHaveBeenCalledTimes(1);
    capa.invalidar('u1');
    await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1');
    expect(lk.porUsuario).toHaveBeenCalledTimes(2);
  });

  it('aislamiento entre usuarios', async () => {
    const lk = {
      porUsuario: vi.fn().mockImplementation((u: string) =>
        Promise.resolve(
          u === 'u1'
            ? [
                {
                  id: 'p1',
                  usuario: 'u1',
                  tipo: 'contiene',
                  valor: 'STRIPE',
                  categoriaId: 'cat-a',
                  prioridad: 100,
                },
              ]
            : [],
        ),
      ),
    };
    const capa = crearCapaPatronesUsuario(lk);
    expect((await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1'))?.categoriaId).toBe('cat-a');
    expect(await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u2')).toBeNull();
  });

  it('dispara onHit con id del patrón al matchear', async () => {
    const onHit = vi.fn();
    const capa = crearCapaPatronesUsuario(
      loader([
        {
          id: 'p1',
          usuario: 'u1',
          tipo: 'contiene',
          valor: 'STRIPE',
          categoriaId: 'cat-a',
          prioridad: 100,
        },
      ]),
      onHit,
    );
    await capa.evaluar({ nombreBancard: 'STRIPE' }, 'u1');
    await new Promise((r) => setImmediate(r));
    expect(onHit).toHaveBeenCalledWith('p1');
  });
});
