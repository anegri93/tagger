import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { aplicarDiffRoute } from './aplicar-diff.js';

function fakeDb(opts: {
  slugs?: Record<string, string>;
  updated?: number;
}) {
  const slugs = opts.slugs ?? {};
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            then: (resolve: (v: { id: string }[]) => unknown) => {
              // Hack: cada llamada devuelve el primer slug aún no resuelto
              // En tests pasamos slugs específicos directamente
              return resolve([]);
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve(Array.from({ length: opts.updated ?? 0 }, (_, i) => ({ id: String(i) }))),
        }),
      }),
    }),
    _slugs: slugs,
  };
}

function fakeDbResolveSlug(map: Record<string, string>, updated = 0) {
  const calls: string[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: (_clause: unknown) => ({
          limit: () => {
            // No tenemos acceso al slug aquí, usamos contador
            const slug = Object.keys(map)[calls.length];
            if (slug) calls.push(slug);
            const id = slug ? map[slug] : null;
            return Promise.resolve(id ? [{ id }] : []);
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve(Array.from({ length: updated }, (_, i) => ({ id: String(i) }))),
        }),
      }),
    }),
  };
  return db;
}

describe('aplicar-diff route', () => {
  it('400 invalid_input si falta body', async () => {
    const app = Fastify();
    await app.register(aplicarDiffRoute(fakeDb({}) as never));
    const r = await app.inject({
      method: 'POST',
      url: '/catalogo/aplicar-diff',
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it('422 si slugs iguales', async () => {
    const app = Fastify();
    await app.register(aplicarDiffRoute(fakeDb({}) as never));
    const r = await app.inject({
      method: 'POST',
      url: '/catalogo/aplicar-diff',
      payload: { categoria_actual_slug: 'x', categoria_nueva_slug: 'x' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe('slugs_iguales');
  });

  it('400 si categoria actual inexistente', async () => {
    const app = Fastify();
    await app.register(aplicarDiffRoute(fakeDbResolveSlug({ a: '', b: 'id-b' }) as never));
    const r = await app.inject({
      method: 'POST',
      url: '/catalogo/aplicar-diff',
      payload: { categoria_actual_slug: 'a', categoria_nueva_slug: 'b' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('categoria_actual_inexistente');
  });

  it('200 con count de actualizadas', async () => {
    const app = Fastify();
    await app.register(
      aplicarDiffRoute(fakeDbResolveSlug({ otros: 'id-otros', ropa: 'id-ropa' }, 7) as never),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/catalogo/aplicar-diff',
      payload: { categoria_actual_slug: 'otros', categoria_nueva_slug: 'ropa' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().actualizadas).toBe(7);
  });

  void vi;
});
