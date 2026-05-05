// Test integración del flujo CRUD via fastify.inject
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { categoriasRoute } from './routes/categorias.js';
import { reglasRoute } from './routes/reglas.js';
import { marcasRoute } from './routes/marcas.js';
import type { CategoriaWriter } from '../db/repos/categorias.js';
import type { ReglaWriter } from '../db/repos/reglas-writer.js';
import type { MarcaWriter } from '../db/repos/marcas.js';

describe('categorias flow integración', () => {
  it('crear cat → agregar regla → agregar marca → eliminar bloqueada', async () => {
    const cats: Array<{ id: string; slug: string; nombre: string; descripcion: string | null }> = [];
    let usage = { movimientos: 0, reglas: 0, mcc: 0, comercios: 0 };

    const catWriter: CategoriaWriter = {
      crear: vi.fn(async (input) => {
        const c = {
          id: `c-${input.slug}`,
          slug: input.slug,
          nombre: input.nombre,
          descripcion: input.descripcion ?? null,
        };
        cats.push(c);
        return c;
      }),
      actualizar: vi.fn(async () => null),
      eliminar: vi.fn(async () => true),
      usage: vi.fn(async () => usage),
    };

    const reglas: Array<{ id: string; patron: string; categoriaSlug: string; prioridad: number; descripcion: string | null; activo: boolean; categoriaId: string }> = [];
    const reglaWriter: ReglaWriter = {
      listar: vi.fn(async () => reglas),
      crear: vi.fn(async (input) => {
        const r = {
          id: `r-${reglas.length}`,
          patron: input.patron,
          categoriaSlug: input.categoriaSlug,
          prioridad: input.prioridad,
          descripcion: input.descripcion ?? null,
          activo: true,
          categoriaId: 'cat-id',
        };
        reglas.push(r);
        usage.reglas++;
        return r;
      }),
      actualizar: vi.fn(),
      eliminar: vi.fn(),
    };

    const marcas: Array<{ id: string; marca: string; descripcion: string | null; categoriaSlug: string }> = [];
    const marcaWriter: MarcaWriter = {
      listar: vi.fn(async () => marcas),
      porCategoria: vi.fn(async () => new Map()),
      crear: vi.fn(async (input) => {
        const m = {
          id: `m-${marcas.length}`,
          marca: input.marca,
          descripcion: input.descripcion ?? null,
          categoriaSlug: input.categoriaSlug,
        };
        marcas.push(m);
        return m;
      }),
      actualizar: vi.fn(),
      eliminar: vi.fn(),
    };

    const reader = { activas: vi.fn(async () => cats) };

    const app = Fastify();
    await app.register(categoriasRoute(reader, catWriter));
    await app.register(reglasRoute(reglaWriter));
    await app.register(marcasRoute(marcaWriter));

    // 1. Crear cat
    const c = await app.inject({
      method: 'POST',
      url: '/categorias',
      payload: { slug: 'mascotas', nombre: 'Mascotas' },
    });
    expect(c.statusCode).toBe(201);

    // 2. Agregar regla
    const r = await app.inject({
      method: 'POST',
      url: '/reglas',
      payload: { patron: '\\bVETERINARIA\\b', categoria_slug: 'mascotas', prioridad: 20 },
    });
    expect(r.statusCode).toBe(201);

    // 3. Agregar marca
    const m = await app.inject({
      method: 'POST',
      url: '/marcas',
      payload: { marca: 'PETSHOP CITY', categoria_slug: 'mascotas' },
    });
    expect(m.statusCode).toBe(201);

    // 4. Usage muestra reglas=1
    const u = await app.inject({ method: 'GET', url: '/categorias/mascotas/usage' });
    expect(u.json().reglas).toBe(1);

    // 5. DELETE bloqueado por refs
    const d = await app.inject({ method: 'DELETE', url: '/categorias/mascotas' });
    expect(d.statusCode).toBe(409);
    expect(d.json().error).toBe('tiene_referencias');

    // 6. Limpiar refs y delete ok
    usage = { movimientos: 0, reglas: 0, mcc: 0, comercios: 0 };
    const d2 = await app.inject({ method: 'DELETE', url: '/categorias/mascotas' });
    expect(d2.statusCode).toBe(200);
  });
});
