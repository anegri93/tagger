#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

let data;
try {
  data = JSON.parse(readFileSync(resolve(root, 'tasks.json'), 'utf8'));
} catch (e) {
  console.error('tasks.json inválido:', e.message);
  process.exit(1);
}

const all = data.phases.flatMap((p) => p.tasks);
const ids = new Set();
for (const t of all) {
  if (ids.has(t.id)) errors.push(`ID duplicado: ${t.id}`);
  ids.add(t.id);
  if (!['pending', 'in_progress', 'done', 'blocked'].includes(t.status)) {
    errors.push(`${t.id}: status inválido '${t.status}'`);
  }
  for (const d of t.depends_on) {
    if (!all.some((x) => x.id === d)) errors.push(`${t.id}: dependencia inexistente '${d}'`);
  }
}

const visited = new Map();
function dfs(id, stack) {
  if (stack.has(id)) {
    errors.push(`Ciclo detectado: ${[...stack, id].join(' → ')}`);
    return;
  }
  if (visited.get(id)) return;
  stack.add(id);
  const t = all.find((x) => x.id === id);
  if (t) for (const d of t.depends_on) dfs(d, stack);
  stack.delete(id);
  visited.set(id, true);
}
for (const t of all) dfs(t.id, new Set());

if (existsSync(resolve(root, 'TASKS.md'))) {
  const before = readFileSync(resolve(root, 'TASKS.md'), 'utf8');
  execSync('node scripts/sync-tasks.mjs', { cwd: root, stdio: 'pipe' });
  const after = readFileSync(resolve(root, 'TASKS.md'), 'utf8');
  if (before !== after) errors.push('TASKS.md desincronizado con tasks.json. Run: pnpm tasks:sync');
}

if (errors.length) {
  console.error('Consistencia FAIL:');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log('Consistencia OK');
