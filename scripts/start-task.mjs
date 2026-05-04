#!/usr/bin/env node
// Marca tarea in_progress. Uso: start-task.mjs <ID>
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) {
  console.error('Uso: start-task.mjs <TASK_ID>');
  process.exit(1);
}

const tasksPath = resolve(root, 'tasks.json');
const data = JSON.parse(readFileSync(tasksPath, 'utf8'));
const all = data.phases.flatMap((p) => p.tasks);
const task = all.find((t) => t.id === id);
if (!task) {
  console.error(`Tarea ${id} no existe`);
  process.exit(1);
}
if (task.status === 'done') {
  console.error(`${id} ya está done`);
  process.exit(1);
}
const pending = task.depends_on.filter((d) => all.find((x) => x.id === d)?.status !== 'done');
if (pending.length) {
  console.error(`✖ ${id} bloqueada. Deps no done: ${pending.join(', ')}`);
  process.exit(1);
}

const inProg = all.find((t) => t.status === 'in_progress' && t.id !== id);
if (inProg) {
  console.error(`✖ Ya hay tarea in_progress: ${inProg.id}. Termina antes empezar otra.`);
  process.exit(1);
}

task.status = 'in_progress';
task.started_at = new Date().toISOString();
task.gates_progress = { consistency: 'pending', lint: 'pending', test: 'pending' };
writeFileSync(tasksPath, JSON.stringify(data, null, 2) + '\n');
execSync('node scripts/sync-tasks.mjs', { cwd: root, stdio: 'inherit' });

console.log(`\n▶ ${id} in_progress: ${task.title}`);
console.log('\nDetalle:');
for (const d of task.detail) console.log('  -', d);
if (task.files?.length) console.log('\nArchivos:', task.files.join(', '));
console.log(`\nAl terminar: node scripts/check-task.mjs ${id}`);
