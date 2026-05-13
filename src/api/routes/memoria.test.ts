import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';
import { memoriaRoute } from './memoria.js';
import type { MemoriaUsuarioWriter } from '../../db/repos/memoria-usuario.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.API_KEY ??= 'test-api-key-min-16-chars-xx';
});

function mockWriter(): MemoriaUsuarioWriter {
  return {
    upsert: vi.fn(),
    listar: vi.fn(),
    eliminar: vi.fn(),
  };
}

async function build(writer: MemoriaUsuarioWriter) {
  const app = Fastify();
  await app.register(memoriaRoute(writer));
  await app.ready();
  return app;
}

describe('GET /memoria/:usuario', () => {
  it('lista items del usuario', async () => {
    const w = mockWriter();
    (w.listar as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        destinatario: 'PEREZ JUAN',
        destinatarioNormalizado: 'PEREZ JUAN',
        categoriaSlug: 'alquiler',
        categoriaNombre: 'Alquiler',
        hits: 3,
        updatedAt: new Date('2026-05-13T10:00:00Z'),
      },
    ]);
    const app = await build(w);
    const r = await app.inject({ method: 'GET', url: '/memoria/usuario_42' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.usuario).toBe('usuario_42');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].categoria_slug).toBe('alquiler');
    expect(body.items[0].hits).toBe(3);
  });

  it('400 usuario inválido', async () => {
    const app = await build(mockWriter());
    const r = await app.inject({ method: 'GET', url: '/memoria/%20' });
    expect(r.statusCode).toBe(400);
  });
});

describe('DELETE /memoria/:usuario/:destinatario', () => {
  it('204 cuando elimina', async () => {
    const w = mockWriter();
    (w.eliminar as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const app = await build(w);
    const r = await app.inject({ method: 'DELETE', url: '/memoria/u1/PEREZ JUAN' });
    expect(r.statusCode).toBe(204);
    expect(w.eliminar).toHaveBeenCalledWith('u1', 'PEREZ JUAN');
  });

  it('404 si no existe', async () => {
    const w = mockWriter();
    (w.eliminar as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const app = await build(w);
    const r = await app.inject({ method: 'DELETE', url: '/memoria/u1/NADIE' });
    expect(r.statusCode).toBe(404);
  });

  it('normaliza destinatario antes de eliminar', async () => {
    const w = mockWriter();
    (w.eliminar as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const app = await build(w);
    await app.inject({ method: 'DELETE', url: '/memoria/u1/peña' });
    expect(w.eliminar).toHaveBeenCalledWith('u1', 'PEÑA');
  });
});
