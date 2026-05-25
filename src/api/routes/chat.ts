import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(4000),
});

const movSchema = z.object({
  id: z.string(),
  nombre: z.string().max(200),
  monto: z.number(),
  fecha: z.string().max(40),
  categoria: z.string().max(80).nullable().optional(),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  movs: z.array(movSchema).max(200).optional().default([]),
  usuario: z.string().max(80).optional(),
});

const FALLBACK_MODELS = [
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Anonimiza nombres de personas — mantiene primer letra para legibilidad.
function anonymize(nombre: string): string {
  // Heurística: nombres con espacios "Apellido Nombre" → iniciales.
  const t = nombre.trim();
  if (/^(transferencia|pago|recarga|envio|cobro)/i.test(t)) return t;
  if (t.length <= 3) return t;
  return t
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w[0] + '***' : w[0] ?? ''))
    .join(' ')
    .trim();
}

function buildSystemPrompt(movs: z.infer<typeof movSchema>[], usuario?: string) {
  const total = movs.length;
  const ingresos = movs.filter((m) => m.monto > 0).reduce((s, m) => s + m.monto, 0);
  const gastos = movs.filter((m) => m.monto < 0).reduce((s, m) => s - m.monto, 0);
  const balance = ingresos - gastos;

  const porCat: Record<string, { count: number; total: number }> = {};
  for (const m of movs) {
    if (m.monto >= 0) continue;
    const cat = m.categoria ?? 'sin-categoria';
    if (!porCat[cat]) porCat[cat] = { count: 0, total: 0 };
    porCat[cat].count += 1;
    porCat[cat].total += -m.monto;
  }
  const topCats = Object.entries(porCat)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6)
    .map(([c, v]) => `${c}: Gs ${v.total.toLocaleString('es-PY')} (${v.count} mov)`)
    .join(' · ');

  // Movs anonimizados, ordenados por fecha desc, máximo 40.
  const recientes = movs
    .slice(0, 40)
    .map(
      (m) =>
        `[id:${m.id.slice(0, 8)}] ${m.fecha} — ${anonymize(m.nombre)} — ${m.monto < 0 ? '-' : '+'}Gs ${Math.abs(m.monto).toLocaleString('es-PY')} — ${m.categoria ?? 'sin-categoria'}`,
    )
    .join('\n');

  return `Sos un asistente financiero personal que habla en español rioplatense/paraguayo, breve y directo.
Tu rol: ayudar al usuario a entender sus movimientos bancarios.

Reglas:
- Respondé SIEMPRE en español, máximo 4 oraciones.
- Si el usuario pregunta sobre un comercio o categoría, calculá totales desde los datos provistos.
- Si no tenés información suficiente, decilo: "No tengo ese dato en tus movimientos recientes".
- No inventes números. Si necesitás un cálculo no presente, decilo.
- Los nombres de personas están anonimizados (J*** P***) — no pidas datos personales.
- No respondas preguntas fuera del dominio financiero.

Resumen del usuario${usuario ? ` (id: ${usuario})` : ''}:
- Movimientos cargados: ${total}
- Ingresos totales: Gs ${ingresos.toLocaleString('es-PY')}
- Gastos totales: Gs ${gastos.toLocaleString('es-PY')}
- Balance: Gs ${balance.toLocaleString('es-PY')}
- Top gastos por categoría: ${topCats || 'sin gastos'}

Movimientos recientes (máx 40):
${recientes || '(ninguno)'}`;
}

export const chatRoute: FastifyPluginAsync = async (app) => {
  app.post('/chat', async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'payload_invalido', detalle: parsed.error.format() });
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return reply.code(503).send({ error: 'openrouter_no_configurado' });
    }

    const requestedModel = process.env.OPENROUTER_MODEL;
    const modelChain = requestedModel ? [requestedModel, ...FALLBACK_MODELS] : FALLBACK_MODELS;
    const { messages, movs, usuario } = parsed.data;
    const systemPrompt = buildSystemPrompt(movs, usuario);

    const payloadMessages =
      messages[0]?.role === 'system'
        ? messages
        : [{ role: 'system' as const, content: systemPrompt }, ...messages];

    let lastError: { status: number; message: string } | null = null;
    const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

    for (const model of modelChain) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const r = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': `${publicUrl}/ui/demo`,
            'X-Title': 'tagger demo',
          },
          body: JSON.stringify({
            model,
            messages: payloadMessages,
            max_tokens: 400,
            temperature: 0.4,
          }),
          signal: controller.signal,
        });
        const body = (await r.json().catch(() => null)) as
          | {
              choices?: Array<{ message?: { content?: string | null } }>;
              error?: { message?: string; code?: number };
            }
          | null;
        if (!r.ok) {
          lastError = { status: r.status, message: body?.error?.message ?? 'upstream error' };
          app.log.warn({ model, status: r.status, body }, 'openrouter try failed, intentando próximo');
          continue;
        }
        const text = body?.choices?.[0]?.message?.content?.trim();
        if (!text) {
          lastError = { status: 502, message: 'respuesta vacía' };
          continue;
        }
        return reply.send({ text, model });
      } catch (e) {
        const isAbort = (e as Error).name === 'AbortError';
        lastError = { status: isAbort ? 504 : 502, message: (e as Error).message };
        app.log.warn({ model, err: (e as Error).message }, 'chat fetch falló');
      } finally {
        clearTimeout(timeout);
      }
    }

    return reply.code(lastError?.status ?? 502).send({
      error: 'openrouter_error',
      detalle: lastError?.message ?? 'todos los modelos fallaron',
      modelos_intentados: modelChain,
    });
  });
};
