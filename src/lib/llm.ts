/**
 * Cliente LLM genérico para IA fallback (capa 4 del pipeline) + cualquier
 * uso futuro. Implementación única: OpenRouter (modelos free + fallback chain).
 * Ollama fue removido — no hay dependencia local.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const DEFAULT_FALLBACK_MODELS = [
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
];

const DEFAULT_TIMEOUT_MS = 20_000;

export interface LlmGenerateOptions {
  prompt: string;
  /** Si 'json', se pide `response_format: {type:'json_object'}`. */
  format?: 'json' | undefined;
  /** Default 0.1 para categorización. */
  temperature?: number;
}

export interface LlmClient {
  generate(opts: LlmGenerateOptions): Promise<string>;
  /** Health probe: verifica que la key + red estén OK. */
  ping(): Promise<boolean>;
}

export interface OpenRouterLlmConfig {
  apiKey: string;
  /** Modelo preferido. Si vacío, usa el primero del fallback chain. */
  preferredModel?: string | undefined;
  fallbackModels?: string[] | undefined;
  timeoutMs?: number | undefined;
  /** Header HTTP-Referer (best practice OpenRouter). */
  publicUrl?: string | undefined;
  fetch?: typeof fetch | undefined;
}

interface ChatChoice {
  message?: { content?: string | null };
}
interface ChatResponse {
  choices?: ChatChoice[];
  error?: { message?: string; code?: number };
}

export function crearOpenRouterLlmClient(cfg: OpenRouterLlmConfig): LlmClient {
  const f = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const referer = cfg.publicUrl ?? 'http://localhost:3000';
  const modelChain = cfg.preferredModel
    ? [cfg.preferredModel, ...(cfg.fallbackModels ?? DEFAULT_FALLBACK_MODELS)]
    : (cfg.fallbackModels ?? DEFAULT_FALLBACK_MODELS);

  async function callModel(model: string, opts: LlmGenerateOptions): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'user', content: opts.prompt }],
        max_tokens: 200,
        temperature: opts.temperature ?? 0.1,
      };
      if (opts.format === 'json') body.response_format = { type: 'json_object' };
      const res = await f(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'tagger ia fallback',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as ChatResponse | null;
      if (!res.ok) {
        const msg = data?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(`openrouter ${model}: ${msg}`);
      }
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error(`openrouter ${model}: respuesta vacía`);
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async generate(opts) {
      let lastErr: unknown;
      for (const model of modelChain) {
        try {
          return await callModel(model, opts);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('openrouter: todos los modelos fallaron');
    },
    async ping() {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const res = await f(OPENROUTER_MODELS_URL, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
          signal: controller.signal,
        });
        clearTimeout(t);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
