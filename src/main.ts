import { sql } from 'drizzle-orm';
import { build } from './api/server.js';
import { healthRoute } from './api/routes/health.js';
import { categorizarRoute } from './api/routes/categorizar.js';
import { importarCatalogoRoute } from './api/routes/importar-catalogo.js';
import { importarMovimientosRoute } from './api/routes/importar-movimientos.js';
import { movimientoGetRoute } from './api/routes/movimiento-get.js';
import { correccionRoute } from './api/routes/correccion.js';
import { categoriasRoute } from './api/routes/categorias.js';
import { mccRoute } from './api/routes/mcc.js';
import { comerciosRoute } from './api/routes/comercios.js';
import { crearComerciosWriter } from './db/repos/comercios-writer.js';
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
import { crearCapaCatalogo } from './layers/catalogo.js';
import { crearCapaMcc } from './layers/mcc.js';
import { crearCapaIa } from './layers/ia.js';
import { crearIaFallback } from './pipeline/ia-fallback.js';
import { crearPatronesLoader, crearPatronWriter } from './db/repos/patrones.js';
import { crearCapaPatrones } from './layers/patrones.js';
import { patronesRoute } from './api/routes/patrones.js';
import { recategorizarCatalogoRoute } from './api/routes/recategorizar-catalogo.js';
import { tokensSinCategoriaRoute } from './api/routes/tokens-sin-categoria.js';
import { aplicarDiffRoute } from './api/routes/aplicar-diff.js';
import { sugerenciasPatronesRoute } from './api/routes/sugerencias-patrones.js';
import { sugerenciasIaRoute } from './api/routes/sugerencias-ia.js';
import { marcasCandidatasRoute } from './api/routes/marcas-candidatas.js';
import { crearMccWriter } from './db/repos/mcc-writer.js';
import { crearCatalogoLookup } from './db/repos/comercios.js';
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
  // Cliente con timeout largo para batch (sugerencias IA con prompts grandes)
  const ollamaBatch = crearOllamaClient({
    url: env.OLLAMA_URL,
    model: env.OLLAMA_MODEL,
    timeoutMs: 300_000, // 5 min
    retries: 0,
  });

  const patronesLoader = crearPatronesLoader(db);
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
    patrones: crearCapaPatrones(patronesLoader),
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
  const patronWriter = crearPatronWriter(db, () => capas.patrones.invalidar());
  await app.register(patronesRoute(patronWriter));
  await app.register(recategorizarCatalogoRoute(db, capas));
  await app.register(importarCatalogoRoute(db, capas));
  await app.register(importarMovimientosRoute(capas, movRepo));
  await app.register(tokensSinCategoriaRoute(db));
  await app.register(aplicarDiffRoute(db));
  await app.register(sugerenciasPatronesRoute(db, patronWriter));
  await app.register(sugerenciasIaRoute(db, ollamaBatch, patronWriter));
  await app.register(marcasCandidatasRoute(db));
  const mccWriter = crearMccWriter(db);
  await app.register(mccRoute(mccWriter));
  const marcaWriter = crearMarcaWriter(db, marcasReader);
  await app.register(marcasRoute(marcaWriter));
  const comerciosWriter = crearComerciosWriter(db);
  await app.register(comerciosRoute(comerciosWriter));
  await app.register(testBatchStatsRoute(crearTestBatchStatsReader(db)));
  const testRunner = new TestBatchRunner({ capas, repo: movRepo, db });
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
