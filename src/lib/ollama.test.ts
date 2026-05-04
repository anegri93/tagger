import { describe, it, expect, vi } from 'vitest';
import { crearOllamaClient } from './ollama.js';

function fetchOk(body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as never;
}

describe('ollama client', () => {
  it('generate llama POST /api/generate y devuelve response', async () => {
    const fetchMock = fetchOk({ response: 'hola', done: true });
    const client = crearOllamaClient({
      url: 'http://localhost:11434',
      model: 'gemma2:2b',
      fetch: fetchMock,
    });
    const r = await client.generate({ prompt: 'hi' });
    expect(r).toBe('hola');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('genera retry una vez si primera falla', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'ok' }), { status: 200 }));
    const client = crearOllamaClient({
      url: 'http://x',
      model: 'm',
      fetch: fetchMock as never,
      retries: 1,
    });
    const r = await client.generate({ prompt: 'p' });
    expect(r).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throw si HTTP no-ok tras retries', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 500 })) as never;
    const client = crearOllamaClient({
      url: 'http://x',
      model: 'm',
      fetch: fetchMock,
      retries: 0,
    });
    await expect(client.generate({ prompt: 'p' })).rejects.toThrow(/Ollama HTTP 500/);
  });

  it('ping true si /api/tags responde 200', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as never;
    const client = crearOllamaClient({ url: 'http://x', model: 'm', fetch: fetchMock });
    expect(await client.ping()).toBe(true);
  });

  it('ping false si fetch lanza', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('net');
    }) as never;
    const client = crearOllamaClient({ url: 'http://x', model: 'm', fetch: fetchMock });
    expect(await client.ping()).toBe(false);
  });
});
