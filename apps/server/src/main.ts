import pg from 'pg';

import { createPlaceholderImageGenerator } from '@ltw/ai';

import { createAiGateway } from './ai/gateway.ts';
import { PostgresAssetContentStore } from './assets/postgres-content-store.ts';
import { startAssetWorkerLoop } from './assets/worker-loop.ts';
import { PostgresAiTraceStore } from './ai/postgres-trace-store.ts';
import { PostgresProposalStore } from './authoring/postgres-proposal-store.ts';
import { buildApp } from './http/app.ts';
import { disabledAuthenticator, loadDevPersonaAuthenticator } from './http/auth.ts';
import { describeDatabaseUrl, loadConfig } from './platform/config/config.ts';
import { createLogger } from './platform/logging/logger.ts';
import { createWorldEngine, randomIds, systemClock } from './world-engine/runtime.ts';

/**
 * Server composition root. Wires platform services, the World Engine, and
 * the HTTP application; owns no domain logic.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-server', level: config.logLevel });
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  // Proposal locks wait for the event store while held, so they get connections of their own.
  const proposalLocks = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });

  const authenticator =
    config.auth.personasFile === null
      ? disabledAuthenticator
      : await loadDevPersonaAuthenticator(config.auth.personasFile);
  if (config.auth.mode === 'dev-personas') {
    logger.warn('development persona authentication is enabled (never use in production)');
  }

  const ai = createAiGateway(config.ai, new PostgresAiTraceStore(pool));
  const authoring = {
    proposals: new PostgresProposalStore(pool, proposalLocks),
    ids: randomIds,
    clock: systemClock,
  };
  const engine = createWorldEngine(pool);
  const contents = new PostgresAssetContentStore(pool);
  const app = buildApp({ engine, authenticator, logger, ai, authoring, assets: { contents } });
  await app.listen({ host: config.http.host, port: config.http.port });
  logger.info(
    {
      nodeEnv: config.nodeEnv,
      authMode: config.auth.mode,
      database: describeDatabaseUrl(config.databaseUrl),
      aiProviders: ai.router.providersFor('reasoning').map((provider) => provider.id),
    },
    'server ready',
  );

  const stopAssets = startAssetWorkerLoop({
    engine,
    contents,
    generator: createPlaceholderImageGenerator(),
    timeoutMs: config.assets.generationTimeoutMs,
    intervalMs: config.assets.workerIntervalMs,
    campaigns: () => PostgresAssetContentStore.campaignsWithAssetWork(pool),
    logger,
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    stopAssets()
      .then(() => app.close())
      .then(() => Promise.all([pool.end(), proposalLocks.end()]))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'shutdown failed');
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
