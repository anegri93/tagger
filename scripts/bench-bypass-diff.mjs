#!/usr/bin/env node
// Compara 2 corridas: bypass_catalogo=false vs true, mismo source.
// Uso: API_KEY=xxx node scripts/bench-bypass-diff.mjs [source] [limit] [concurrency]

import 'dotenv/config';

const API = process.env.API_URL || 'http://localhost:3000';
const KEY = process.env.API_KEY;
if (!KEY) {
  console.error('falta API_KEY en env o .env');
  process.exit(1);
}

const SOURCE = process.argv[2] || 'mcc_por_nombre';
const LIMIT = process.argv[3] ? Number(process.argv[3]) : undefined;
const CONC = Number(process.argv[4] ?? 30);

const HDR = { 'content-type': 'application/json', 'x-api-key': KEY };

async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...HDR, ...(opts.headers ?? {}) } });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${path} → ${r.status} ${txt}`);
  }
  return r.json();
}

async function runBatch(batchId, bypass) {
  console.log(`\n▶ Corriendo ${batchId} (bypass_catalogo=${bypass})`);
  const body = {
    batch_id: batchId,
    concurrency: CONC,
    bypass_catalogo: bypass,
    source: SOURCE,
  };
  if (LIMIT) body.limit = LIMIT;
  await api('/test-batch/start', { method: 'POST', body: JSON.stringify(body) });

  let last = '';
  while (true) {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await api(`/test-batch/${encodeURIComponent(batchId)}/stats`);
    const total = s.total;
    const cob = s.cobertura;
    const msg = `  procesados ${total} · sync ${cob.sync_ok_pct.toFixed(1)}% · ${s.throughput_rps_total.toFixed(1)} rps`;
    if (msg !== last) {
      process.stdout.write('\r' + msg.padEnd(80));
      last = msg;
    }
    const list = await api('/test-batch/list');
    const run = list.items.find((x) => x.batchId === batchId);
    if (run && run.status !== 'running') {
      process.stdout.write('\n');
      // Reconsulta stats final para no quedarte con stats parcial
      const finalStats = await api(`/test-batch/${encodeURIComponent(batchId)}/stats`);
      return finalStats;
    }
    if (!run) {
      // Aún no aparece en list, esperar otra ronda
      continue;
    }
  }
}

function fmt(n) {
  if (n == null) return '—';
  return typeof n === 'number' ? n.toLocaleString('es-PY') : String(n);
}

function pct(num, total) {
  return total > 0 ? `${((100 * num) / total).toFixed(1)}%` : '—';
}

function diff(off, on) {
  const head = (l, a, b) =>
    `${l.padEnd(28)} │ ${String(a).padStart(14)} │ ${String(b).padStart(14)}`;
  const sep = '─'.repeat(28) + '─┼─' + '─'.repeat(14) + '─┼─' + '─'.repeat(14);

  console.log('\n\n=== DIFF bypass OFF vs bypass ON ===\n');
  console.log(head('Métrica', 'bypass OFF', 'bypass ON'));
  console.log(sep);
  console.log(head('Total movs', fmt(off.total), fmt(on.total)));
  console.log(head('Sync OK', fmt(off.cobertura.sync_ok), fmt(on.cobertura.sync_ok)));
  console.log(head('  %', `${off.cobertura.sync_ok_pct.toFixed(1)}%`, `${on.cobertura.sync_ok_pct.toFixed(1)}%`));
  console.log(head('Revisión', fmt(off.cobertura.revision), fmt(on.cobertura.revision)));
  console.log(head('Sin categoría', fmt(off.cobertura.sin_categoria), fmt(on.cobertura.sin_categoria)));
  console.log(sep);
  console.log(head('Latencia avg ms', fmt(off.latencia.avg), fmt(on.latencia.avg)));
  console.log(head('Latencia p95 ms', fmt(off.latencia.p95), fmt(on.latencia.p95)));
  console.log(head('Latencia p99 ms', fmt(off.latencia.p99), fmt(on.latencia.p99)));
  console.log(head('Throughput rps', off.throughput_rps_total.toFixed(1), on.throughput_rps_total.toFixed(1)));
  console.log(sep);
  console.log(head('Coincidencia %', `${off.agreement.pct.toFixed(2)}%`, `${on.agreement.pct.toFixed(2)}%`));
  console.log(head('  match', fmt(off.agreement.match), fmt(on.agreement.match)));
  console.log(head('  mismatch', fmt(off.agreement.mismatch), fmt(on.agreement.mismatch)));
  console.log(head('  sin catálogo (excl)', fmt(off.agreement.sin_catalogo), fmt(on.agreement.sin_catalogo)));
  console.log(head('  sin predicción', fmt(off.agreement.sin_prediccion), fmt(on.agreement.sin_prediccion)));

  console.log('\n=== Fuente categoría ===');
  console.log('OFF:', off.fuente.map((f) => `${f.fuente}=${f.count}(${f.pct.toFixed(1)}%)`).join(' · '));
  console.log('ON :', on.fuente.map((f) => `${f.fuente}=${f.count}(${f.pct.toFixed(1)}%)`).join(' · '));

  console.log('\n=== Análisis ===');
  const aporteCatalogo = on.cobertura.sin_categoria - off.cobertura.sin_categoria;
  console.log(`• Catálogo aporta cobertura a ${fmt(aporteCatalogo)} movs (${pct(aporteCatalogo, on.total)})`);
  console.log(`• Sin catálogo, cobertura sync cae ${(off.cobertura.sync_ok_pct - on.cobertura.sync_ok_pct).toFixed(1)} pp`);
  console.log(`• ${fmt(on.agreement.mismatch)} mismatches reales (reglas predicen ≠ catálogo). Revisar.`);
  console.log(`• ${pct(on.agreement.sin_catalogo, on.total)} del total son nombres no curados en mcc_por_nombre.`);
}

(async () => {
  console.log(`Source: ${SOURCE} · concurrency: ${CONC}${LIMIT ? ` · limit: ${LIMIT}` : ''}`);

  const off = await runBatch('bench-bypass-off', false);
  // Limpiar movs entre runs para que segundo run no acumule (mismo source, distinto batch_id ya separa, pero igual reset por seguridad)

  const on = await runBatch('bench-bypass-on', true);
  diff(off, on);

  console.log('\nIDs:');
  console.log('  bench-bypass-off (datos persisten en DB)');
  console.log('  bench-bypass-on');
  console.log('Ver mismatches: /ui/test-monitor/ con batch_id=bench-bypass-on (métrica honesta)');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
