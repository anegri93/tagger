import { sql } from 'drizzle-orm';
import { build } from './api/server.js';
import { healthRoute } from './api/routes/health.js';
import { categorizarRoute } from './api/routes/categorizar.js';
import { movimientoGetRoute } from './api/routes/movimiento-get.js';
import { correccionRoute } from './api/routes/correccion.js';
import { categoriasRoute } from './api/routes/categorias.js';
import { reglasRoute } from './api/routes/reglas.js';
import { mccRoute } from './api/routes/mcc.js';
import { catalogoRoute } from './api/routes/catalogo.js';
import { CatalogoMassiveRunner } from './test-batch/catalogo-runner.js';
import { marcasRoute } from './api/routes/marcas.js';
import { crearMarcaWriter, crearMarcasReader } from './db/repos/marcas.js';
import { testBatchStatsRoute } from './api/routes/test-batch-stats.js';
import { testBatchControlRoute } from './api/routes/test-batch-control.js';
import { TestBatchRunner } from './test-batch/runner.js';
import { requestLog } from './api/plugins/request-log.js';
import { apiKeyAuth } from './api/plugins/auth.js';
import { db, pool } from './db/client.js';
import { env } from './config/env.js';
import { crearOllamaClient } from './lib/ollama.js';
import { logger } from './lib/logger.js';
import { crearCapaRegex } from './layers/regex.js';
import { crearCapaBancard } from './layers/bancard.js';
import { crearCapaComercio } from './layers/comercio.js';
import { crearCapaCatalogo } from './layers/catalogo.js';
import { crearCapaMcc } from './layers/mcc.js';
import { crearCapaIa } from './layers/ia.js';
import { crearIaFallback } from './pipeline/ia-fallback.js';
import { crearReglasLoader } from './db/repos/reglas.js';
import { crearReglaWriter } from './db/repos/reglas-writer.js';
import { crearMccWriter } from './db/repos/mcc-writer.js';
import {
  crearBancardLookup,
  crearComercioLookup,
  crearCatalogoLookup,
} from './db/repos/comercios.js';
import { crearMccLookup } from './db/repos/mcc.js';
import {
  crearMovimientoRepository,
  crearMovimientoUpdater,
  crearMovimientoReader,
} from './db/repos/movimientos.js';
import { crearCorreccionService } from './db/repos/correccion.js';
import {
  crearCategoriasReader,
  crearCategoriasLoader,
  crearCategoriaResolver,
  crearCategoriaWriter,
} from './db/repos/categorias.js';
import { crearTestBatchStatsReader } from './db/repos/test-batch-stats.js';

async function pingDb(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const ollama = crearOllamaClient({ url: env.OLLAMA_URL, model: env.OLLAMA_MODEL });

  const reglasLoader = crearReglasLoader(db);
  const bancardLookup = crearBancardLookup(db);
  const comercioLookup = crearComercioLookup(db);
  const catalogoLookup = crearCatalogoLookup(db);
  const mccLookup = crearMccLookup(db);
  const movRepo = crearMovimientoRepository(db);
  const movUpdater = crearMovimientoUpdater(db);
  const movReader = crearMovimientoReader(db);
  const correccionSvc = crearCorreccionService(db);
  const categoriasReader = crearCategoriasReader(db);
  const categoriasLoader = crearCategoriasLoader(db);
  const categoriaResolver = crearCategoriaResolver(db);
  const marcasReader = crearMarcasReader(db);

  const capas = {
    catalogo: crearCapaCatalogo(catalogoLookup),
    regex: crearCapaRegex(reglasLoader),
    bancard: crearCapaBancard(bancardLookup),
    comercio: crearCapaComercio(comercioLookup),
    mcc: crearCapaMcc(mccLookup),
  };
  const capaIa = crearCapaIa(ollama, categoriasLoader, marcasReader);
  const iaFallback = crearIaFallback({
    capa: capaIa,
    updater: movUpdater,
    logger,
  });

  const app = await build();
  await app.register(requestLog);
  await app.register(healthRoute({ pingDb, pingOllama: () => ollama.ping() }));
  await app.register(apiKeyAuth, { apiKey: env.API_KEY });
  await app.register(
    categorizarRoute({ capas, repo: movRepo, iaFallback, categorias: categoriaResolver }),
  );
  await app.register(movimientoGetRoute(movReader, categoriaResolver));
  await app.register(correccionRoute(correccionSvc, categoriaResolver));
  const categoriaWriter = crearCategoriaWriter(db, categoriaResolver);
  await app.register(categoriasRoute(categoriasReader, categoriaWriter));
  const reglaWriter = crearReglaWriter(db, () => capas.regex.invalidar());
  await app.register(reglasRoute(reglaWriter));
  const mccWriter = crearMccWriter(db);
  await app.register(mccRoute(mccWriter));
  const catalogoRunner = new CatalogoMassiveRunner({
    db,
    resolveCategoria: () => undefined,
  });
  await app.register(catalogoRoute(catalogoRunner));
  const marcaWriter = crearMarcaWriter(db, marcasReader);
  await app.register(marcasRoute(marcaWriter));
  await app.register(testBatchStatsRoute(crearTestBatchStatsReader(db)));
  const testRunner = new TestBatchRunner({ capas, repo: movRepo });
  await app.register(testBatchControlRoute(testRunner));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'tagger API listening');
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ err }, 'startup failed');
  process.exit(1);
});
