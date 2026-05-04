#!/usr/bin/env node
// Muestra siguiente tarea disponible (deps done, status pending).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'tasks.json'), 'utf8'));
const all = data.phases.flatMap((p) => p.tasks);

const inProg = all.find((t) => t.status === 'in_progress');
if (inProg) {
  console.log(`▶ in_progress: ${inProg.id} — ${inProg.title}`);
  console.log(`  Verificar: node scripts/check-task.mjs ${inProg.id}`);
  process.exit(0);
}

const next = all.filter(
  (t) =>
    t.status === 'pending' &&
    t.depends_on.every((d) => all.find((x) => x.id === d)?.status === 'done'),
);

if (!next.length) {
  console.log('🎉 Sin tareas desbloqueadas.');
  process.exit(0);
}

console.log('Disponibles:');
for (const t of next.slice(0, 5)) console.log(`  ${t.id} — ${t.title}`);
console.log(`\nIniciar: node scripts/start-task.mjs ${next[0].id}`);
