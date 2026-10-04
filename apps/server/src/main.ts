import pg from 'pg';

import { createAiGateway } from './ai/gateway.ts';
import { PostgresAiTraceStore } from './ai/postgres-trace-store.ts';
import { buildApp } from './http/app.ts';
import { disabledAuthenticator, loadDevPersonaAuthenticator } from './http/auth.ts';
import { describeDatabaseUrl, loadConfig } from './platform/config/config.ts';
import { createLogger } from './platform/logging/logger.ts';
import { createWorldEngine } from './world-engine/runtime.ts';

/**
 * Server composition root. Wires platform services, the World Engine, and
 * the HTTP application; owns no domain logic.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-server', level: config.logLevel });
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  const authenticator =
    config.auth.personasFile === null
      ? disabledAuthenticator
      : await loadDevPersonaAuthenticator(config.auth.personasFile);
  if (config.auth.mode === 'dev-personas') {
    logger.warn('development persona authentication is enabled (never use in production)');
  }

  const ai = createAiGateway(config.ai, new PostgresAiTraceStore(pool));
  const app = buildApp({ engine: createWorldEngine(pool), authenticator, logger, ai });
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

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    app
      .close()
      .then(() => pool.end())
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
