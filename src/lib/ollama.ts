export interface OllamaConfig {
  url: string;
  model: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
}

export interface OllamaGenerateOptions {
  prompt: string;
  format?: 'json' | undefined;
  temperature?: number;
}

export interface OllamaResponse {
  response: string;
  done: boolean;
}

export interface OllamaClient {
  generate(opts: OllamaGenerateOptions): Promise<string>;
  ping(): Promise<boolean>;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRIES = 1;

export function crearOllamaClient(cfg: OllamaConfig): OllamaClient {
  const f = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = cfg.retries ?? DEFAULT_RETRIES;
  const base = cfg.url.replace(/\/+$/, '');

  async function callOnce(opts: OllamaGenerateOptions): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await f(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          prompt: opts.prompt,
          stream: false,
          format: opts.format,
          options: opts.temperature !== undefined ? { temperature: opts.temperature } : undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const data = (await res.json()) as OllamaResponse;
      return data.response ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async generate(opts) {
      let lastErr: unknown;
      for (let i = 0; i <= retries; i++) {
        try {
          return await callOnce(opts);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Ollama generate failed');
    },
    async ping() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await f(`${base}/api/tags`, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
