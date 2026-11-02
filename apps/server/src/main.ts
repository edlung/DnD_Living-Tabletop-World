import type pg from 'pg';

import { createPlaceholderImageGenerator, type ImageGenerator } from '@ltw/ai';

import { AccountingTasks } from './ai/accounting-tasks.ts';
import {
  PostgresBudgetStore,
  accountingStatus,
  approvalExists,
} from './ai/accounting/postgres-budget-store.ts';
import { VERIFIED_CATALOG, identityResolver } from './ai/catalog.ts';
import { createAiGateway, type AiGateway } from './ai/gateway.ts';
import { PostgresAiJournal } from './ai/journal.ts';
import { createCampaignPreparationRuntime } from './ai/preparation-gateway.ts';
import { PostgresCampaignGenerationRepository } from './workshop/generation/postgres-store.ts';
import { CampaignGenerationWorker } from './workshop/generation/worker.ts';
import { CampaignEditWorker } from './workshop/generation/edit-worker.ts';
import { startCampaignGenerationLoop } from './workshop/generation/worker-loop.ts';
import { PostgresDraftImageRepository } from './workshop/images/postgres-store.ts';
import { DraftImageWorker } from './workshop/images/worker.ts';
import { startDraftImageLoop } from './workshop/images/worker-loop.ts';
import { createDraftImageRuntime } from './images/draft-runtime.ts';
import { PostgresAssetContentStore } from './assets/postgres-content-store.ts';
import { startAssetWorkerLoop } from './assets/worker-loop.ts';
import { composeAuthentication, startCredentialPruning } from './auth/composition.ts';
import { PostgresCredentialStore } from './auth/postgres-credential-store.ts';
import { PostgresWorkshopStore } from './workshop/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from './workshop/packages/postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from './workshop/revisions/postgres-store.ts';
import { PostgresCampaignActivationRepository } from './workshop/activation/postgres-store.ts';
import { CampaignActivationWorker } from './workshop/activation/worker.ts';
import { startCampaignActivationLoop } from './workshop/activation/worker-loop.ts';
import { PostgresCampaignInitialContentStore } from './campaigns/postgres-content.ts';
import { PostgresCampaignPublication } from './campaigns/postgres-publication.ts';
import { createCampaignQuestBooks } from './campaigns/quest-books.ts';
import { isCuratedRequest } from './images/curated-import.ts';
import { loadCuratedSet } from './images/curated-set.ts';
import { PostgresImageLedger, imageBudgetStatus } from './images/ledger.ts';
import { loadQuestBook } from './quests/quest-book.ts';
import { PostgresProposalStore } from './authoring/postgres-proposal-store.ts';
import { PostgresSubstitutionStore } from './dm/postgres-substitution-store.ts';
import { PostgresAccountStore } from './accounts/postgres-account-store.ts';
import { PostgresRestStore, PostgresTableStore } from './dice/postgres-table-store.ts';
import { serverDice } from './dice/table-rolls.ts';
import { buildLiveApp } from './live/live-app.ts';
import {
  describeDatabaseUrl,
  loadConfig,
  obsoleteVariables,
  type AppConfig,
} from './platform/config/config.ts';
import { loadMigrations } from './platform/db/migration-source.ts';
import { MIGRATIONS_DIR } from './platform/db/migrations-dir.ts';
import { createPool } from './platform/db/pool.ts';
import { createLogger, type Logger } from './platform/logging/logger.ts';
import {
  createWorldEngine,
  createRawWorldEngine,
  randomIds,
  systemClock,
} from './world-engine/runtime.ts';
import { storeReadiness } from './world-engine/store-readiness.ts';

/**
 * Server composition root. Wires platform services, the World Engine, and
 * the HTTP application; owns no domain logic.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ service: 'ltw-server', level: config.logLevel });
  // Pools survive the database closing idle connections (a restart): see `createPool`.
  const pool = createPool(config.databaseUrl, logger);
  // Proposal locks wait for the event store while held, so they get connections of their own.
  const proposalLocks = createPool(config.databaseUrl, logger, { max: 4 });

  // Sign-in by mode (docs/adr/0036-production-sign-in.md §5): session cookies from DM
  // invitations in production; development personas are refused under NODE_ENV=production.
  const { authenticator, signIn: baseSignIn } = await composeAuthentication(
    config,
    () => new PostgresCredentialStore(pool),
    undefined,
    () => new PostgresAccountStore(pool),
  );
  const publication = new PostgresCampaignPublication(pool);
  const signIn = baseSignIn ? { ...baseSignIn, publication } : null;
  if (config.auth.mode === 'dev-personas') {
    logger.warn('development persona authentication is enabled (never use in production)');
  }

  // Accounting failures are reported by fixed code only: never amounts, campaigns or providers.
  const tasks = new AccountingTasks((issue) => {
    logger.warn({ issue }, 'AI accounting needs operator attention');
  });
  const budget = new PostgresBudgetStore(pool, identityResolver(VERIFIED_CATALOG));
  const approvalStored =
    config.ai.approvalId !== null && (await approvalExists(pool, config.ai.approvalId));
  const ai = createAiGateway(config.ai, {
    journal: new PostgresAiJournal(pool, (issue) => {
      tasks.report(issue);
    }),
    budget,
    catalog: VERIFIED_CATALOG,
    approvalStored,
    tasks,
  });
  const generation = signIn
    ? {
        repository: new PostgresCampaignGenerationRepository(pool),
        preparation: createCampaignPreparationRuntime(config.ai, {
          pool,
          budget,
          catalog: VERIFIED_CATALOG,
          approvalStored,
          tasks,
        }),
      }
    : null;
  const generationWorker = generation ? new CampaignGenerationWorker(generation) : null;
  const campaignPackages = signIn ? new PostgresCampaignRevisionRepository(pool) : null;
  const edits = generation
    ? {
        repository: new PostgresCampaignGenerationRepository(pool, 'EDIT'),
        preparation: generation.preparation,
      }
    : null;
  const editWorker =
    edits && campaignPackages
      ? new CampaignEditWorker({ ...edits, packages: campaignPackages })
      : null;
  const authoring = {
    proposals: new PostgresProposalStore(pool, proposalLocks),
    ids: randomIds,
    clock: systemClock,
  };
  const engine = createWorldEngine(pool, publication);
  const contents = new PostgresAssetContentStore(pool);
  const initialContent = new PostgresCampaignInitialContentStore(pool);
  // Before the server listens: a generator that cannot be built stops the start (ADR 0035 §1).
  let generator: ImageGenerator;
  try {
    generator = await imageGenerator(config, pool, logger);
  } catch (error) {
    logger.error('image generator unavailable; not starting');
    await ai.accounting.shutdown();
    await Promise.all([pool.end(), proposalLocks.end()]);
    throw error;
  }
  const quests = await loadQuestBook(config.questsFile);
  const draftImageRepository = signIn ? new PostgresDraftImageRepository(pool) : null;
  const draftImages = draftImageRepository
    ? {
        repository: draftImageRepository,
        runtime: createDraftImageRuntime({ pool, config, logger, contents: draftImageRepository }),
      }
    : null;
  const draftImageWorker = draftImages ? new DraftImageWorker(draftImages) : null;
  const activation =
    signIn && draftImageRepository
      ? {
          repository: new PostgresCampaignActivationRepository(pool),
          initialContent,
          contents,
          draftImages: draftImageRepository,
          bootstrap: createRawWorldEngine(pool),
        }
      : null;
  const activationWorker = activation ? new CampaignActivationWorker(activation) : null;
  // After a rollback (LTW_ALLOW_NEWER_SCHEMA) readiness parses every stored event first: a newer
  // build may have written events this one cannot read anywhere in a stream (ADR 0037).
  const readiness = storeReadiness(pool, await loadMigrations(MIGRATIONS_DIR), logger, {
    readEveryEvent: config.allowNewerSchema,
  });
  // The live session (ADR 0033) closes its streams with `shutdown` when the app closes.
  const { app } = buildLiveApp({
    engine,
    authenticator,
    logger,
    ai,
    authoring,
    // The DM's reasons for acting for a player (ADR 0033 §6; migration 0009).
    dm: { substitutions: new PostgresSubstitutionStore(pool), clock: systemClock },
    // The table's rolls, the DM's check requests and short rests (Stages 510, 530; 0025, 0026).
    table: {
      store: new PostgresTableStore(pool),
      rests: new PostgresRestStore(pool),
      dice: serverDice,
      now: () => new Date().toISOString(),
    },
    assets: { contents },
    quests,
    campaignQuests: createCampaignQuestBooks(initialContent),
    ...(signIn ? { signIn } : {}),
    ...(signIn
      ? {
          workshop: {
            store: new PostgresWorkshopStore(pool),
            ...(campaignPackages
              ? {
                  packages: campaignPackages,
                  revisionControls: new PostgresCampaignRevisionControlRepository(pool),
                }
              : {}),
            ...(draftImages && draftImageWorker
              ? {
                  images: draftImages,
                  cancelImage: (jobId: string) => {
                    draftImageWorker.cancel(jobId);
                  },
                }
              : {}),
            ...(generation && generationWorker
              ? {
                  generation,
                  cancelGeneration: (jobId: string) => {
                    generationWorker.cancel(jobId);
                  },
                }
              : {}),
            ...(edits && editWorker
              ? {
                  edits,
                  cancelEdit: (jobId: string) => {
                    editWorker.cancel(jobId);
                  },
                }
              : {}),
            ...(activation ? { activation, campaignEntry: { engine, signIn } } : {}),
            publicOrigin: signIn.publicOrigin,
            clock: signIn.clock,
            limits: signIn.limits,
          },
        }
      : {}),
    // Request limits key on the client behind this reverse proxy (ADR 0036, 2026-10-16).
    trustedProxies: config.http.trustedProxies,
    readiness,
  });
  await app.listen({ host: config.http.host, port: config.http.port });
  logger.info(
    {
      nodeEnv: config.nodeEnv,
      authMode: config.auth.mode,
      trustedProxies: config.http.trustedProxies.length,
      database: describeDatabaseUrl(config.databaseUrl),
      allowNewerSchema: config.allowNewerSchema,
    },
    'server ready',
  );
  reportAiSpending(logger, pool, ai);
  // The first verdict is logged now; later probes log only changes.
  void readiness();

  const stopGeneration =
    generation && generationWorker
      ? startCampaignGenerationLoop(generation.repository, generationWorker, logger)
      : () => Promise.resolve();
  const stopPruning = signIn ? startCredentialPruning(signIn.credentials, logger) : () => undefined;
  const stopActivation =
    activation && activationWorker
      ? startCampaignActivationLoop(activation.repository, activationWorker, logger)
      : () => Promise.resolve();
  const stopEdits =
    edits && editWorker
      ? startCampaignGenerationLoop(edits.repository, editWorker, logger)
      : () => Promise.resolve();
  const stopDraftImages =
    draftImages && draftImageWorker
      ? startDraftImageLoop(draftImages.repository, draftImageWorker, logger)
      : () => Promise.resolve();
  const stopAssets = startAssetWorkerLoop({
    engine,
    contents,
    generator,
    timeoutMs: config.assets.generationTimeoutMs,
    intervalMs: config.assets.workerIntervalMs,
    campaigns: () => PostgresAssetContentStore.campaignsWithAssetWork(pool),
    // The curated import's requests are its own (ADR 0035 §3): never generated or paid for here.
    skip: isCuratedRequest,
    logger,
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    stopPruning();
    Promise.all([stopAssets(), stopGeneration(), stopEdits(), stopDraftImages(), stopActivation()])
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
 * The asset worker's image generator (docs/adr/0035-images.md §1): the local placeholder, or an
 * OpenAI image model through OpenRouter under the explicit stored monetary policy. Startup
 * names the generator and model and whether a ceiling is stored; never the key or an amount.
 */
async function imageGenerator(
  config: AppConfig,
  pool: pg.Pool,
  logger: Logger,
): Promise<ImageGenerator> {
  const chosen = config.assets.generator;
  if (chosen.kind === 'placeholder') {
    logger.info({ generator: 'placeholder' }, 'image generator');
    return createPlaceholderImageGenerator();
  }
  // Loaded only when configured: sharp's native image library is needed by this generator alone.
  const { createOpenRouterImageGenerator } = await import('./images/openrouter-generator.ts');
  const { loadStyleReferences } = await import('./images/style-references.ts');
  const generator = createOpenRouterImageGenerator({
    apiKey: chosen.apiKey,
    model: chosen.model,
    ledger: new PostgresImageLedger(pool),
    styleReferences: await loadStyleReferences(await loadCuratedSet()),
    timeoutMs: config.assets.generationTimeoutMs,
    logger,
  });
  logger.info({ generator: generator.id, model: chosen.model }, 'image generator');
  imageBudgetStatus(pool).then(
    (status) => {
      if (status.monetaryPolicy?.mode !== 'UNLIMITED' && status.ceilingMicros === null) {
        logger.warn(
          'no image ceiling stored: every image call is denied until the operator sets one',
        );
      }
    },
    () => {
      logger.warn('image ledger status unavailable');
    },
  );
  return generator;
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
