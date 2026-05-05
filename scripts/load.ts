import { db, pool } from '../src/db/client.js';
import { categorias as categoriasTable } from '../src/db/schema/index.js';
import { runLoader, logResult, type LoaderConfig, type LoaderContext } from '../src/db/loaders/csv.js';
import { categoriasLoaderConfig } from '../src/db/loaders/categorias.js';
import { categoriasExtrasLoaderConfig } from '../src/db/loaders/categorias-extras.js';
import { reglasLoaderConfig } from '../src/db/loaders/reglas.js';
import { reglasExtrasLoaderConfig } from '../src/db/loaders/reglas-extras.js';
import { marcasLoaderConfig } from '../src/db/loaders/marcas.js';
import { mccLoaderConfig } from '../src/db/loaders/mcc.js';
import { mccGeneralLoaderConfig } from '../src/db/loaders/mcc-general.js';
import { mccCategoriaLoaderConfig } from '../src/db/loaders/mcc-categoria.js';
import { mccExtrasLoaderConfig } from '../src/db/loaders/mcc-extras.js';
import { mangoP2pLoaderConfig } from '../src/db/loaders/mango-p2p.js';
import { comerciosLoaderConfig } from '../src/db/loaders/comercios.js';
import { comerciosBancardLoaderConfig } from '../src/db/loaders/comercios-bancard.js';
import { loadComerciosBancardMasivo } from '../src/db/loaders/comercios-bancard-masivo.js';

const LOADERS: Record<string, LoaderConfig<Record<string, string>, Record<string, unknown>>> = {
  categorias: categoriasLoaderConfig as never,
  'categorias-extras': categoriasExtrasLoaderConfig as never,
  reglas: reglasLoaderConfig as never,
  'reglas-extras': reglasExtrasLoaderConfig as never,
  marcas: marcasLoaderConfig as never,
  mcc: mccLoaderConfig as never,
  'mcc-general': mccGeneralLoaderConfig as never,
  'mcc-categoria': mccCategoriaLoaderConfig as never,
  'mcc-extras': mccExtrasLoaderConfig as never,
  'mango-p2p': mangoP2pLoaderConfig as never,
  comercios: comerciosLoaderConfig as never,
  'comercios-bancard': comerciosBancardLoaderConfig as never,
};

const ORDER = ['categorias', 'reglas', 'mcc', 'comercios', 'comercios-bancard'];

async function buildCtx(): Promise<LoaderContext> {
  const cats = await db
    .select({ id: categoriasTable.id, slug: categoriasTable.slug })
    .from(categoriasTable);
  const map = new Map(cats.map((c) => [c.slug, c.id]));
  return {
    db,
    resolveCategoria: (slug) => map.get(slug),
  };
}

async function main() {
  const target = process.argv[2] ?? 'all';
  const overrideFile = process.argv[3];

  if (target === 'comercios-bancard-masivo') {
    const ctx = await buildCtx();
    const r = await loadComerciosBancardMasivo(
      ctx,
      overrideFile ?? 'data/comercios-bancard-staged.tsv',
    );
    console.warn(
      `[comercios-bancard-masivo] total ${r.total} | regex ${r.porFuente.regex} mcc ${r.porFuente.mcc} nombre ${r.porFuente.nombre} | revisión ${r.revisión}`,
    );
    return;
  }

  const targets = target === 'all' ? ORDER : [target];
  for (const t of targets) {
    const cfg = LOADERS[t];
    if (!cfg) {
      console.error(`Loader '${t}' no existe. Disponibles: ${Object.keys(LOADERS).join(', ')}, comercios-bancard-masivo, all`);
      process.exit(1);
    }
  }

  for (const t of targets) {
    const cfg = LOADERS[t]!;
    const cfgOverride = overrideFile && targets.length === 1 ? { ...cfg, file: overrideFile } : cfg;
    const ctx = await buildCtx();
    const r = await runLoader(cfgOverride, ctx);
    logResult(r);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
