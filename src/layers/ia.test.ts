import { describe, it, expect, vi } from 'vitest';
import { crearCapaIa, type CategoriaActiva } from './ia.js';
import type { OllamaClient } from '../lib/ollama.js';

const CATS: CategoriaActiva[] = [
  { id: 'c-super', slug: 'supermercado', nombre: 'Supermercado' },
  { id: 'c-comb', slug: 'combustible', nombre: 'Combustible' },
];

function loaderFijo(c: CategoriaActiva[]) {
  return { activas: vi.fn().mockResolvedValue(c) };
}

function clientFijo(response: string): OllamaClient {
  return {
    generate: vi.fn().mockResolvedValue(response),
    ping: vi.fn().mockResolvedValue(true),
  };
}

describe('capa ia', () => {
  it('parsea respuesta válida y mapea slug → categoría', async () => {
    const capa = crearCapaIa(
      clientFijo('{"categoria_slug": "combustible", "confianza": 0.6}'),
      loaderFijo(CATS),
    );
    const r = await capa.evaluar({ descripcion: 'COMPRA SHELL' });
    expect(r?.categoriaId).toBe('c-comb');
    expect(r?.fuente).toBe('ia');
    expect(r?.confianza).toBe(0.6);
  });

  it('confianza recortada a IA_MAX (0.70)', async () => {
    const capa = crearCapaIa(
      clientFijo('{"categoria_slug": "supermercado", "confianza": 0.99}'),
      loaderFijo(CATS),
    );
    const r = await capa.evaluar({ descripcion: 'X' });
    expect(r?.confianza).toBe(0.7);
  });

  it('slug inexistente devuelve null', async () => {
    const capa = crearCapaIa(
      clientFijo('{"categoria_slug": "lalala", "confianza": 0.9}'),
      loaderFijo(CATS),
    );
    expect(await capa.evaluar({ descripcion: 'X' })).toBeNull();
  });

  it('respuesta no parseable devuelve null', async () => {
    const capa = crearCapaIa(clientFijo('texto random'), loaderFijo(CATS));
    expect(await capa.evaluar({ descripcion: 'X' })).toBeNull();
  });

  it('error generate devuelve null (no propaga)', async () => {
    const client: OllamaClient = {
      generate: vi.fn().mockRejectedValue(new Error('boom')),
      ping: vi.fn(),
    };
    const capa = crearCapaIa(client, loaderFijo(CATS));
    expect(await capa.evaluar({ descripcion: 'X' })).toBeNull();
  });

  it('sin categorías devuelve null', async () => {
    const capa = crearCapaIa(clientFijo('{}'), loaderFijo([]));
    expect(await capa.evaluar({ descripcion: 'X' })).toBeNull();
  });

  it('categoria_slug null devuelve null', async () => {
    const capa = crearCapaIa(
      clientFijo('{"categoria_slug": null, "confianza": 0}'),
      loaderFijo(CATS),
    );
    expect(await capa.evaluar({ descripcion: 'X' })).toBeNull();
  });
});
