#!/usr/bin/env node
// Validación final de fase: todas tareas done + 3 gates globales pasan limpio.
// Uso: validate-phase.mjs <PHASE_ID>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) {
  console.error('Uso: validate-phase.mjs <PHASE_ID>');
  process.exit(1);
}

const tasksPath = resolve(root, 'tasks.json');
const data = JSON.parse(readFileSync(tasksPath, 'utf8'));
const phase = data.phases.find((p) => p.id === id);
if (!phase) {
  console.error(`Fase ${id} no existe`);
  process.exit(1);
}

console.log(`\n═══ Validación final fase ${phase.id} — ${phase.name} ═══\n`);

const notDone = phase.tasks.filter((t) => t.status !== 'done');
if (notDone.length) {
  console.error(`✖ Fase incompleta. Tareas no done:`);
  for (const t of notDone) console.error(`  - ${t.id} (${t.status}) ${t.title}`);
  process.exit(1);
}
console.log(`  ✓ ${phase.tasks.length} tareas done`);

const gates = data.meta.gates;
let allOk = true;
for (const [name, cmd] of Object.entries(gates)) {
  process.stdout.write(`  ${name}... `);
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
    console.log('OK');
  } catch (e) {
    allOk = false;
    console.log('FAIL');
    console.log(e.stdout?.toString() ?? '');
    console.log(e.stderr?.toString() ?? '');
  }
}

if (!allOk) {
  console.error(`\n✖ Fase ${id} NO valida. Fix antes avanzar a siguiente fase.`);
  process.exit(1);
}

phase.validated = true;
phase.validated_at = new Date().toISOString();
writeFileSync(tasksPath, JSON.stringify(data, null, 2) + '\n');
execSync('node scripts/sync-tasks.mjs', { cwd: root, stdio: 'pipe' });

console.log(`\n✔ Fase ${phase.id} validada. ${phase.tasks.length} tareas + 3 gates globales OK.`);
