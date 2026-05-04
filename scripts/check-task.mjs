#!/usr/bin/env node
// Corre 3 gates pa tarea. Persiste estado por gate progresivo. Si pasa, marca done.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) {
  console.error('Uso: check-task.mjs <TASK_ID>');
  process.exit(1);
}

const tasksPath = resolve(root, 'tasks.json');

function readData() {
  return JSON.parse(readFileSync(tasksPath, 'utf8'));
}
function writeData(d) {
  writeFileSync(tasksPath, JSON.stringify(d, null, 2) + '\n');
}
function findTask(d) {
  return d.phases.flatMap((p) => p.tasks).find((t) => t.id === id);
}
function syncUI() {
  try {
    execSync('node scripts/sync-tasks.mjs', { cwd: root, stdio: 'pipe' });
  } catch {
    /* ignore */
  }
}
function setGate(name, value) {
  const d = readData();
  const t = findTask(d);
  if (!t) return;
  t.gates_progress = { ...(t.gates_progress ?? {}), [name]: value };
  writeData(d);
  syncUI();
}

const initial = readData();
const task = findTask(initial);
if (!task) {
  console.error(`Tarea ${id} no existe`);
  process.exit(1);
}

const all = initial.phases.flatMap((p) => p.tasks);
const pendingDeps = task.depends_on.filter((d) => {
  const dep = all.find((x) => x.id === d);
  return !dep || dep.status !== 'done';
});
if (pendingDeps.length) {
  console.error(`✖ ${id} bloqueada. Dependencias no done: ${pendingDeps.join(', ')}`);
  process.exit(1);
}

console.log(`\n▶ Verificando ${id} — ${task.title}\n`);

// reset gates progress al inicio
{
  const d = readData();
  const t = findTask(d);
  t.gates_progress = { consistency: 'running', lint: 'pending', test: 'pending' };
  writeData(d);
  syncUI();
}

const gates = initial.meta.gates;
const results = {};
const order = ['consistency', 'lint', 'test'];

for (let i = 0; i < order.length; i++) {
  const name = order[i];
  const cmd = gates[name];
  setGate(name, 'running');
  process.stdout.write(`  ${name}... `);
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
    results[name] = true;
    setGate(name, 'pass');
    console.log('OK');
    if (i + 1 < order.length) setGate(order[i + 1], 'running');
  } catch (e) {
    results[name] = false;
    setGate(name, 'fail');
    console.log('FAIL');
    console.log(e.stdout?.toString() ?? '');
    console.log(e.stderr?.toString() ?? '');
    break;
  }
}

const ok = order.every((n) => results[n]);
if (!ok) {
  console.error(`\n✖ ${id} NO pasa gates. Estado sin cambios. Fix antes avanzar.`);
  process.exit(1);
}

{
  const d = readData();
  const t = findTask(d);
  t.status = 'done';
  t.completed_at = new Date().toISOString();
  t.gates_progress = { consistency: 'pass', lint: 'pass', test: 'pass' };
  writeData(d);
  syncUI();
}

console.log(`\n✔ ${id} done. tasks.json actualizado y TASKS.md sync.`);

const afterData = readData();
const phase = afterData.phases.find((p) => p.tasks.some((t) => t.id === id));
if (phase && phase.tasks.every((t) => t.status === 'done') && !phase.validated) {
  console.log(`\n═══ Última tarea de fase ${phase.id} done. Corriendo validación fase ═══`);
  try {
    execSync(`node scripts/validate-phase.mjs ${phase.id}`, { cwd: root, stdio: 'inherit' });
  } catch {
    console.error(`\n⚠ Validación fase ${phase.id} falló. Revisar antes seguir.`);
    process.exit(1);
  }
}

const after = readData();
const allAfter = after.phases.flatMap((p) => p.tasks);
const nextTask = allAfter.find(
  (t) =>
    t.status === 'pending' &&
    t.depends_on.every((d) => allAfter.find((x) => x.id === d)?.status === 'done'),
);
if (nextTask) {
  console.log(`\n→ Siguiente disponible: ${nextTask.id} — ${nextTask.title}`);
  console.log(`  Marcar in_progress: node scripts/start-task.mjs ${nextTask.id}`);
} else {
  console.log('\n🎉 Sin tareas pendientes desbloqueadas.');
}
