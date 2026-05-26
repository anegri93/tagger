import { sql } from 'drizzle-orm';
import { build } from './api/server.js';
import { healthRoute } from './api/routes/health.js';
import { categorizarRoute } from './api/routes/categorizar.js';
import { importarCatalogoRoute } from './api/routes/importar-catalogo.js';
import { importarMovimientosRoute } from './api/routes/importar-movimientos.js';
import { movimientoGetRoute, movimientoListRoute } from './api/routes/movimiento-get.js';
import { movimientoReprocesarRoute } from './api/routes/movimiento-reprocesar.js';
import { correccionRoute } from './api/routes/correccion.js';
import { categoriasRoute } from './api/routes/categorias.js';
import { mccRoute } from './api/routes/mcc.js';
import { comerciosRoute } from './api/routes/comercios.js';
import { crearComerciosWriter } from './db/repos/comercios-writer.js';
import { marcasRoute } from './api/routes/marcas.js';
import { crearMarcaWriter, crearMarcasReader } from './db/repos/marcas.js';
import { testBatchStatsRoute } from './api/routes/test-batch-stats.js';
import { groundTruthAgreementRoute } from './api/routes/ground-truth-agreement.js';
import { analisisProfundoRoute } from './api/routes/analisis-profundo.js';
import { testBatchControlRoute } from './api/routes/test-batch-control.js';
import { TestBatchRunner } from './test-batch/runner.js';
import { requestLog } from './api/plugins/request-log.js';
import { apiKeyAuth } from './api/plugins/auth.js';
import { db, pool } from './db/client.js';
import { env } from './config/env.js';
import { crearOllamaClient } from './lib/ollama.js';
import { logger } from './lib/logger.js';
import { crearCapaMcc } from './layers/mcc.js';
import { crearCapaIa } from './layers/ia.js';
import { crearIaFallback } from './pipeline/ia-fallback.js';
import { crearReglasLoader, crearReglasWriter } from './db/repos/reglas.js';
import { crearCapaReglas } from './layers/reglas.js';
import { reglasRoute } from './api/routes/reglas.js';
import { presupuestosRoute } from './api/routes/presupuestos.js';
import { categoriasUsuarioRoute } from './api/routes/categorias-usuario.js';
import { crearCategoriaUsuarioRepo, crearSubcategoriaResolver } from './db/repos/categorias-usuario.js';
import { crearMccWriter } from './db/repos/mcc-writer.js';
import { crearMccPorNombreLookup } from './db/repos/comercios.js';
import { crearMccLookup } from './db/repos/mcc.js';
import {
  crearMovimientoRepository,
  crearMovimientoUpdater,
  crearMovimientoReader,
  crearMovimientoInputReader,
  crearMovimientoReprocesador,
  crearMovimientoLister,
} from './db/repos/movimientos.js';
import {
  crearCorreccionService,
  crearCorreccionMemoriaWriter,
} from './db/repos/correccion.js';
import {
  crearCategoriasReader,
  crearCategoriasLoader,
  crearCategoriaResolver,
  crearCategoriaWriter,
  crearCategoriasSimilaresReader,
} from './db/repos/categorias.js';
import {
  categoriasSimilaresRoute,
  movimientoCategoriasSugeridasRoute,
} from './api/routes/categorias-similares.js';
import { crearTestBatchStatsReader } from './db/repos/test-batch-stats.js';
import { statsPipelineRoute } from './api/routes/stats-pipeline.js';
import { crearDescripcionUsoRepo } from './db/repos/descripcion-uso.js';
import { descripcionesRoute } from './api/routes/descripciones.js';
import { chatRoute } from './api/routes/chat.js';
import { demoConfigRoute } from './api/routes/demo-config.js';

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
  const mccPorNombreLookup = crearMccPorNombreLookup(db);
  const mccLookup = crearMccLookup(db);
  const movRepo = crearMovimientoRepository(db);
  const movUpdater = crearMovimientoUpdater(db);
  const movReader = crearMovimientoReader(db);
  const correccionMemoria = crearCorreccionMemoriaWriter(db);
  const descripcionUsoRepo = crearDescripcionUsoRepo(db);
  const categoriasReader = crearCategoriasReader(db);
  const categoriasLoader = crearCategoriasLoader(db);
  const categoriaResolver = crearCategoriaResolver(db);
  const marcasReader = crearMarcasReader(db);

  // Writer separado para incrementar hits async sin invalidar cache.
  const reglasWriterParaHits = crearReglasWriter(db);
  const capaReglas = crearCapaReglas(reglasLoader, {
    ttlMs: env.REGLAS_CACHE_TTL_MS,
    maxEntries: env.REGLAS_CACHE_MAX,
    onHit: (id) => {
      void reglasWriterParaHits.incrementarHit(id).catch(() => undefined);
    },
  });

  const capas = {
    reglas: capaReglas,
    mcc: crearCapaMcc(mccLookup, mccPorNombreLookup),
  };

  const correccionSvc = crearCorreccionService(db, correccionMemoria, (scope) =>
    capaReglas.invalidar(scope),
  );

  const capaIa = crearCapaIa(ollama, categoriasLoader, marcasReader);
  const iaFallback = env.IA_ENABLED
    ? crearIaFallback({
        capa: capaIa,
        updater: movUpdater,
        logger,
        maxConcurrent: env.OLLAMA_MAX_CONCURRENT,
      })
    : { schedule: () => undefined };
  if (!env.IA_ENABLED) {
    logger.info(
      'IA_ENABLED=false — fallback IA deshabilitado, movimientos no resueltos quedan sin categoría',
    );
  }

  const app = await build({ trustProxy: true });
  await app.register(requestLog);
  const healthDeps = env.IA_ENABLED ? { pingDb, pingOllama: () => ollama.ping() } : { pingDb };
  await app.register(healthRoute(healthDeps));
  await app.register(apiKeyAuth, { apiKey: env.API_KEY });
  const categoriaUsuarioRepo = crearCategoriaUsuarioRepo(db);
  await app.register(
    categorizarRoute({
      capas,
      repo: movRepo,
      iaFallback,
      categorias: categoriaResolver,
      memoria: correccionMemoria,
      invalidarReglas: (scope) => capaReglas.invalidar(scope),
      descripcionUso: descripcionUsoRepo,
      categoriasUsuario: categoriaUsuarioRepo,
    }),
  );
  await app.register(descripcionesRoute(descripcionUsoRepo));
  const subcategoriaResolver = crearSubcategoriaResolver(db);
  await app.register(
    movimientoListRoute(crearMovimientoLister(db), categoriaResolver, subcategoriaResolver),
  );
  await app.register(movimientoGetRoute(movReader, categoriaResolver, subcategoriaResolver));
  await app.register(
    movimientoReprocesarRoute({
      capas,
      reader: crearMovimientoInputReader(db),
      reprocesador: crearMovimientoReprocesador(db),
      iaFallback,
      categorias: categoriaResolver,
    }),
  );
  await app.register(correccionRoute(correccionSvc, categoriaResolver));
  const reglasWriter = crearReglasWriter(db, (scope) => capaReglas.invalidar(scope));
  await app.register(reglasRoute(reglasWriter));
  await app.register(presupuestosRoute(db));
  await app.register(categoriasUsuarioRoute({ repo: categoriaUsuarioRepo }));
  const categoriaWriter = crearCategoriaWriter(db, categoriaResolver);
  await app.register(categoriasRoute(categoriasReader, categoriaWriter));
  const categoriasSimilaresReader = crearCategoriasSimilaresReader(db);
  await app.register(categoriasSimilaresRoute(db, categoriasSimilaresReader));
  await app.register(movimientoCategoriasSugeridasRoute(movReader, categoriasSimilaresReader));
  await app.register(importarCatalogoRoute(db, capas));
  await app.register(importarMovimientosRoute(capas, movRepo));
  const mccWriter = crearMccWriter(db);
  await app.register(mccRoute(mccWriter));
  const marcaWriter = crearMarcaWriter(db, marcasReader);
  await app.register(marcasRoute(marcaWriter));
  const comerciosWriter = crearComerciosWriter(db);
  await app.register(comerciosRoute(comerciosWriter));
  await app.register(testBatchStatsRoute(crearTestBatchStatsReader(db)));
  await app.register(statsPipelineRoute(db));
  await app.register(groundTruthAgreementRoute(db));
  await app.register(analisisProfundoRoute(db));
  const testRunner = new TestBatchRunner({ capas, repo: movRepo, db });
  await app.register(testBatchControlRoute(testRunner));
  await app.register(chatRoute);
  await app.register(demoConfigRoute);

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
