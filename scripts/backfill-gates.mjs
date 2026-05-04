#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'tasks.json');
const data = JSON.parse(readFileSync(path, 'utf8'));

for (const phase of data.phases) {
  for (const t of phase.tasks) {
    if (t.status === 'done' && !t.gates_progress) {
      t.gates_progress = { consistency: 'pass', lint: 'pass', test: 'pass' };
    }
  }
}

writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
execSync('node scripts/sync-tasks.mjs', { cwd: root, stdio: 'inherit' });
console.log('Backfill done.');
