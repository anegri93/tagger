import { build, context } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function readEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const env = readEnv();
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [resolve(root, 'ui/demo/src/main.tsx')],
  outfile: resolve(root, 'ui/demo/app.js'),
  bundle: true,
  jsx: 'automatic',
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  target: 'es2020',
  format: 'iife',
  minify: !watch,
  sourcemap: watch,
  define: {
    'process.env.TAGGER_API_KEY': JSON.stringify(env.API_KEY ?? ''),
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching ui/demo/src...');
} else {
  await build(options);
  console.log('built ui/demo/app.js');
}
