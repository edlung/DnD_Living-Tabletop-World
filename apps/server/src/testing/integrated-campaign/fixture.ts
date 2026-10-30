import { randomUUID } from 'node:crypto';

import { AccountingTasks } from '../../ai/accounting-tasks.ts';
import { setMonetaryPolicy } from '../../ai/accounting/monetary-policy.ts';
import { grantPreparationApproval } from '../../ai/accounting/preparation-sessions.ts';
import { PostgresBudgetStore } from '../../ai/accounting/postgres-budget-store.ts';
import { identityResolver } from '../../ai/catalog.ts';
import { createCampaignPreparationRuntime } from '../../ai/preparation-gateway.ts';
import { PostgresAssetContentStore } from '../../assets/postgres-content-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../../auth/limits.ts';
import { PostgresCredentialStore } from '../../auth/postgres-credential-store.ts';
import { sessionAuthenticator, systemAuthClock } from '../../auth/session-authenticator.ts';
import type { SignInDependencies } from '../../auth/sign-in.ts';
import { evidenceHasher } from '../../auth/tokens.ts';
import { PostgresCampaignInitialContentStore } from '../../campaigns/postgres-content.ts';
import { PostgresCampaignPublication } from '../../campaigns/postgres-publication.ts';
import { createCampaignQuestBooks } from '../../campaigns/quest-books.ts';
import { buildApp } from '../../http/app.ts';
import { Secret, loadConfig } from '../../platform/config/config.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import { PostgresCampaignActivationRepository } from '../../workshop/activation/postgres-store.ts';
import { CampaignActivationWorker } from '../../workshop/activation/worker.ts';
import { CampaignEditWorker } from '../../workshop/generation/edit-worker.ts';
import { PostgresCampaignGenerationRepository } from '../../workshop/generation/postgres-store.ts';
import { CampaignGenerationWorker } from '../../workshop/generation/worker.ts';
import { PostgresDraftImageRepository } from '../../workshop/images/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../../workshop/packages/postgres-store.ts';
import { PostgresWorkshopStore } from '../../workshop/postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from '../../workshop/revisions/postgres-store.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../../workshop/service.ts';
import { createRawWorldEngine, createWorldEngine } from '../../world-engine/runtime.ts';
import { TEST_AUTH, accountingDb, seedApproval } from '../accounting.ts';
import { FIXTURE_CATALOG } from '../catalog-fixtures.ts';
import { englishBellCampaign } from '../generation/bell-english.ts';
import { testAiGateway, testAuthoring, testDm } from '../ravenford-app.ts';
import { sessionCookieOf, tokenOfLink } from '../sign-in.ts';
import { integratedCampaignTransport } from './transport.ts';

export const INTEGRATED_ORIGIN = 'https://table.example';
const unavailableImages = {
  availability: () =>
    Promise.resolve({
      available: false as const,
      reason: 'NO_ROUTE' as const,
      provider: null,
      model: null,
    }),
  prepare: () => Promise.resolve({ status: 'UNAVAILABLE' as const, reason: 'NO_ROUTE' }),
  forJob: () => Promise.resolve(null),
};

/** Blank private draft through HTTP; no prebuilt revision or canonical campaign is seeded. */
export async function integratedCampaignFixture() {
  const db = await accountingDb();
  const cleanup: (() => Promise<unknown>)[] = [() => db.close()];
  const close = async () => {
    for (const stop of cleanup.splice(0).reverse()) await stop();
  };
  try {
    const store = new PostgresWorkshopStore(db.pool),
      packages = new PostgresCampaignRevisionRepository(db.pool),
      images = new PostgresDraftImageRepository(db.pool),
      controls = new PostgresCampaignRevisionControlRepository(db.pool),
      generation = new PostgresCampaignGenerationRepository(db.pool),
      edits = new PostgresCampaignGenerationRepository(db.pool, 'EDIT');
    const content = englishBellCampaign(),
      transport = integratedCampaignTransport(db.pool2(), content),
      accountingIssues: string[] = [],
      tasks = new AccountingTasks((issue) => accountingIssues.push(issue));
    cleanup.push(() => tasks.shutdown());
    const preparation = createCampaignPreparationRuntime(
      {
        ...loadConfig({}).ai,
        approvalId: 'integrated-offline',
        routes: { 'campaign-preparation': ['anthropic:claude-sonnet-5-5'] },
        anthropic: {
          apiKey: new Secret('test-not-real'),
          model: 'claude-sonnet-5-5',
          timeoutMs: 5000,
        },
        requestTimeoutMs: 8000,
        preparationTimeoutMs: 8000,
      },
      {
        pool: db.pool,
        budget: new PostgresBudgetStore(db.pool, identityResolver(FIXTURE_CATALOG)),
        catalog: FIXTURE_CATALOG,
        approvalStored: true,
        tasks,
        fetch: transport.fetchImpl,
      },
    );
    const publication = new PostgresCampaignPublication(db.pool),
      engine = createWorldEngine(db.pool, publication),
      bootstrap = createRawWorldEngine(db.pool),
      initialContent = new PostgresCampaignInitialContentStore(db.pool),
      contents = new PostgresAssetContentStore(db.pool),
      activationRepository = new PostgresCampaignActivationRepository(db.pool);
    const credentials = new PostgresCredentialStore(db.pool),
      signIn: SignInDependencies = {
        publication,
        credentials,
        publicOrigin: INTEGRATED_ORIGIN,
        clock: systemAuthClock,
        limits: new RequestLimits(SIGN_IN_LIMITS, Date.now),
        evidence: evidenceHasher(),
      };
    const activation = {
        repository: activationRepository,
        initialContent,
        contents,
        draftImages: images,
        bootstrap,
      },
      generationWorker = new CampaignGenerationWorker({ repository: generation, preparation }),
      editWorker = new CampaignEditWorker({ repository: edits, preparation, packages }),
      activationWorker = new CampaignActivationWorker(activation);
    cleanup.push(() => activationWorker.shutdown());
    const workshop: WorkshopDependencies = {
      store,
      packages,
      revisionControls: controls,
      generation: { repository: generation, preparation },
      edits: { repository: edits, preparation },
      cancelGeneration: (id) => {
        generationWorker.cancel(id);
      },
      cancelEdit: (id) => {
        editWorker.cancel(id);
      },
      images: { repository: images, runtime: unavailableImages },
      activation,
      campaignEntry: { engine, signIn },
      clock: systemAuthClock,
      publicOrigin: INTEGRATED_ORIGIN,
      limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, Date.now),
    };
    const app = buildApp({
      engine,
      authenticator: sessionAuthenticator(credentials, systemAuthClock),
      signIn,
      logger: createLogger({ service: 'integrated-campaign-offline', level: 'silent' }),
      ai: testAiGateway(),
      authoring: testAuthoring(),
      dm: testDm(),
      assets: { contents },
      quests: [],
      campaignQuests: createCampaignQuestBooks(initialContent),
      workshop,
    });
    cleanup.push(() => app.close());
    await app.ready();
    const sendGame = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
      app.inject({
        method,
        url,
        headers: { origin: INTEGRATED_ORIGIN, cookie },
        ...(payload ? { payload } : {}),
      });
    const ownerId = randomUUID(),
      invitation = await issueWorkshopInvitation(workshop, {
        ownerId,
        hours: 1,
        authorizationSource: 'test:450-integrated-offline',
      });
    const redeemed = await sendGame('POST', '/workshop/auth/redeem', '', {
      token: tokenOfLink(invitation.link),
    });
    const rawCookie = redeemed.headers['set-cookie'],
      ownerCookie = (typeof rawCookie === 'string' ? rawCookie : rawCookie?.[0])?.split(';')[0];
    if (redeemed.statusCode !== 200 || !ownerCookie) throw new Error('TEST_WORKSHOP_REDEEM');
    const sendOwner = (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({
        method,
        url,
        headers: { origin: INTEGRATED_ORIGIN, cookie: ownerCookie, 'x-workshop-owner': ownerId },
        ...(payload ? { payload } : {}),
      });
    const draft = await sendOwner('POST', '/workshop/drafts', {
      requestId: randomUUID(),
      title: 'Integrated offline Bell specimen',
      language: 'en',
    });
    if (draft.statusCode !== 200) throw new Error('TEST_CREATE_DRAFT');
    const draftId = draft.json<{ draftId: string }>().draftId,
      scope = { ownerId, draftId },
      url = `/workshop/drafts/${draftId}`;
    // The existing approval format retains its legacy campaign list. Preparation
    // authority comes from the separate owner grant below; every request remains
    // campaign_id=NULL and no legacy campaign stream is created or used.
    await seedApproval(db, { approvalId: 'integrated-offline' });
    await setMonetaryPolicy(db.pool, {
      scope: 'text',
      accountId: 'acct',
      mode: 'UNLIMITED',
      authorization: TEST_AUTH,
    });
    await grantPreparationApproval(db.pool, {
      approvalId: 'integrated-offline',
      ownerId,
      enabled: true,
      authorization: TEST_AUTH,
    });
    const redeemGame = async (link: string) => {
      const answer = await sendGame('POST', '/auth/redeem', '', { token: tokenOfLink(link) });
      const cookie = sessionCookieOf(answer);
      if (answer.statusCode !== 200 || !cookie) throw new Error('TEST_GAME_REDEEM');
      return cookie;
    };
    return {
      db,
      app,
      scope,
      url,
      ownerCookie,
      content,
      store,
      packages,
      images,
      controls,
      generation,
      edits,
      preparation,
      transport,
      tasks,
      accountingIssues,
      generationWorker,
      editWorker,
      activationWorker,
      activationRepository,
      engine,
      bootstrap,
      initialContent,
      contents,
      publication,
      credentials,
      sendOwner,
      sendGame,
      redeemGame,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
