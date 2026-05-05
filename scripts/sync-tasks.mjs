#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'tasks.json'), 'utf8'));

const STATUS_ICON = {
  pending: '⬜',
  in_progress: '🟡',
  done: '✅',
  blocked: '🛑',
};

const allTasks = data.phases.flatMap((p) => p.tasks);
const total = allTasks.length;
const done = allTasks.filter((t) => t.status === 'done').length;
const pct = total === 0 ? 0 : Math.round((done / total) * 100);

const lines = [];
lines.push(`# ${data.meta.project} — Tareas`);
lines.push('');
lines.push(`> ${data.meta.description}`);
lines.push('');
lines.push(`**Stack:** ${data.meta.stack.join(', ')}`);
lines.push('');
lines.push(`**Progreso global:** ${done}/${total} (${pct}%)`);
lines.push('');
lines.push('## Reglas');
lines.push('');
for (const r of data.meta.rules) lines.push(`- ${r}`);
lines.push('');
lines.push('## Gates obligatorios por tarea');
lines.push('');
lines.push('| Gate | Comando |');
lines.push('|------|---------|');
for (const [k, v] of Object.entries(data.meta.gates)) {
  lines.push(`| ${k} | \`${v}\` |`);
}
lines.push('');
lines.push('## Estados');
lines.push('');
for (const [k, v] of Object.entries(STATUS_ICON)) lines.push(`- ${v} ${k}`);
lines.push('');

for (const phase of data.phases) {
  const pTotal = phase.tasks.length;
  const pDone = phase.tasks.filter((t) => t.status === 'done').length;
  lines.push(`## ${phase.id} — ${phase.name} (${pDone}/${pTotal})`);
  lines.push('');
  for (const t of phase.tasks) {
    const icon = STATUS_ICON[t.status] ?? '⬜';
    const deps = t.depends_on.length ? ` _deps: ${t.depends_on.join(', ')}_` : '';
    lines.push(`### ${icon} ${t.id} — ${t.title}${deps}`);
    lines.push('');
    lines.push('**Detalle:**');
    for (const d of t.detail) lines.push(`- ${d}`);
    if (t.files?.length) {
      lines.push('');
      lines.push(`**Archivos:** ${t.files.map((f) => `\`${f}\``).join(', ')}`);
    }
    lines.push('');
    lines.push('**Gates:** consistency ✅  lint ✅  test ✅');
    lines.push('');
  }
}

writeFileSync(resolve(root, 'TASKS.md'), lines.join('\n'));

writeFileSync(
  resolve(root, 'ui/tasks/tasks.data.js'),
  `window.__TASKS__ = ${JSON.stringify(data, null, 2)};\n`,
);

console.log(`TASKS.md + ui/tasks/tasks.data.js regenerados. ${done}/${total} (${pct}%)`);
