import pg from 'pg';

import { createPlaceholderImageGenerator } from '@ltw/ai';

import { AccountingTasks } from './ai/accounting-tasks.ts';
import {
  PostgresBudgetStore,
  accountingStatus,
  approvalExists,
} from './ai/accounting/postgres-budget-store.ts';
import { VERIFIED_CATALOG, identityResolver } from './ai/catalog.ts';
import { createAiGateway, type AiGateway } from './ai/gateway.ts';
import { PostgresAiJournal } from './ai/journal.ts';
import { PostgresAssetContentStore } from './assets/postgres-content-store.ts';
import { startAssetWorkerLoop } from './assets/worker-loop.ts';
import { loadQuestBook } from './quests/quest-book.ts';
import { PostgresProposalStore } from './authoring/postgres-proposal-store.ts';
import { buildApp } from './http/app.ts';
import { disabledAuthenticator, loadDevPersonaAuthenticator } from './http/auth.ts';
import { describeDatabaseUrl, loadConfig, obsoleteVariables } from './platform/config/config.ts';
import { createLogger, type Logger } from './platform/logging/logger.ts';
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

  // Accounting failures are reported by fixed code only: never amounts, campaigns or providers.
  const tasks = new AccountingTasks((issue) => {
    logger.warn({ issue }, 'AI accounting needs operator attention');
  });
  const ai = createAiGateway(config.ai, {
    journal: new PostgresAiJournal(pool, (issue) => {
      tasks.report(issue);
    }),
    budget: new PostgresBudgetStore(pool, identityResolver(VERIFIED_CATALOG)),
    catalog: VERIFIED_CATALOG,
    approvalStored:
      config.ai.approvalId !== null && (await approvalExists(pool, config.ai.approvalId)),
    tasks,
  });
  const authoring = {
    proposals: new PostgresProposalStore(pool, proposalLocks),
    ids: randomIds,
    clock: systemClock,
  };
  const engine = createWorldEngine(pool);
  const contents = new PostgresAssetContentStore(pool);
  const quests = await loadQuestBook(config.questsFile);
  const app = buildApp({
    engine,
    authenticator,
    logger,
    ai,
    authoring,
    assets: { contents },
    quests,
  });
  await app.listen({ host: config.http.host, port: config.http.port });
  logger.info(
    {
      nodeEnv: config.nodeEnv,
      authMode: config.auth.mode,
      database: describeDatabaseUrl(config.databaseUrl),
    },
    'server ready',
  );
  reportAiSpending(logger, pool, ai);

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
      // Settlement retries stop; any unsettled hold stays for the operator.
      .then(() => ai.accounting.shutdown())
      .then(() => Promise.all([pool.end(), proposalLocks.end()]))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'shutdown failed');
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

/**
 * Reports the resolved route of every AI capability, any refused remote entry with its fixed reason,
 * and held and pending accounting state as counts; never keys, prompts, campaigns or amounts, and
 * never reconciles anything (docs/adr/0032-live-ai.md).
 */
function reportAiSpending(logger: Logger, pool: pg.Pool, ai: AiGateway): void {
  for (const variable of obsoleteVariables()) {
    logger.warn(
      { variable },
      'ignored: AI spending ceilings are operator records, not configuration',
    );
  }
  for (const route of ai.routes) {
    logger.info({ capability: route.capability, providers: route.providers }, 'AI route');
    for (const { entry, reason } of route.refused) {
      logger.warn({ capability: route.capability, entry, reason }, 'remote AI route refused');
    }
  }
  accountingStatus(pool).then(
    (status) => {
      logger.info(status, 'AI accounting status (shared by every player and DM request)');
    },
    () => {
      logger.warn('AI accounting status unavailable');
    },
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
