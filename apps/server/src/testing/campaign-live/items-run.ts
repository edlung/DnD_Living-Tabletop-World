import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  CampaignGenerationJob,
  CampaignGenerationView,
  CampaignRevisionView,
} from '@ltw/contracts';

import { AccountingTasks } from '../../ai/accounting-tasks.ts';
import { setMonetaryPolicy } from '../../ai/accounting/monetary-policy.ts';
import { grantPreparationApproval } from '../../ai/accounting/preparation-sessions.ts';
import { PostgresBudgetStore } from '../../ai/accounting/postgres-budget-store.ts';
import { spendReport } from '../../ai/accounting/spend-report.ts';
import type { Authorization } from '../../ai/accounting/types.ts';
import { identityResolver, VERIFIED_CATALOG } from '../../ai/catalog.ts';
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
import { CampaignGenerationWorker } from '../../workshop/generation/worker.ts';
import { PostgresCampaignGenerationRepository } from '../../workshop/generation/postgres-store.ts';
import { PostgresDraftImageRepository } from '../../workshop/images/postgres-store.ts';
import { PostgresCampaignRevisionRepository } from '../../workshop/packages/postgres-store.ts';
import { PostgresWorkshopStore } from '../../workshop/postgres-store.ts';
import { PostgresCampaignRevisionControlRepository } from '../../workshop/revisions/postgres-store.ts';
import { issueWorkshopInvitation, type WorkshopDependencies } from '../../workshop/service.ts';
import { createRawWorldEngine, createWorldEngine } from '../../world-engine/runtime.ts';
import { accountingDb } from '../accounting.ts';
import { testAiGateway, testAuthoring, testDm } from '../ravenford-app.ts';
import { tokenOfLink } from '../sign-in.ts';

/**
 * The owner-authorized live run of Stage 490 (work-orders/STAGE_490_LIVE.md): one real seven-step
 * generation on claude-sonnet-5-5 whose brief asks for starting items. Start it with
 * `node --env-file=.env.local --conditions=@ltw/source <this file>`; the credential is read from the
 * process environment only, never printed. No activation, no pictures, no default-database writes.
 */
const AUTHORIZATION_FILE = 'reviews/OWNER_LIVE_CAMPAIGN_AUTHORIZATION_2026-10-31.json';
const EVIDENCE_DIR = 'reports/evidence/stage-490-live-2026-10-31';
const AUTH: Authorization = {
  ownerId: 'owner',
  authorizedOn: '2026-10-31',
  source: AUTHORIZATION_FILE,
};
const ORIGIN = 'https://table.example';
const MICROS = 15_000_000n;

const BRIEF = {
  intent:
    'Короткое расследование в портовом городке: пропали рыбацкие сети гильдии, и никто не хочет говорить почему. ' +
    'У героев есть собственное стартовое снаряжение.',
  setting: 'Небольшой портовый город у холодного моря, ранняя осень.',
  tone: 'Тёплая, немного тревожная история с понятными мотивами.',
  duration: 'Первая сессия около двух часов.',
  partySize: 2,
  partyLevel: 3,
  include: [
    'Каждый герой и несколько NPC несут стартовые предметы: используй предметы каталога (possessions) — зелья, плащи, щиты, инструменты',
    'Несколько путей к уликам',
    'Мирное решение возможно',
  ],
  exclude: ['Обязательный бой'],
} as const;

const say = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const authorization = JSON.parse(await readFile(AUTHORIZATION_FILE, 'utf8')) as {
    model: string;
    provider: string;
  };
  if (authorization.model !== 'claude-sonnet-5-5' || authorization.provider !== 'anthropic')
    throw new Error('LIVE_AUTHORIZATION_MISMATCH');
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('LIVE_CREDENTIAL_MISSING');
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFile(join(EVIDENCE_DIR, name), `${JSON.stringify(value, null, 2)}\n`);

  const db = await accountingDb();
  const tasks = new AccountingTasks((issue) => {
    say(`accounting issue: ${issue}`);
  });
  let keepDatabase: boolean;
  let ownerId = '';
  // A run that did not succeed keeps its database, so the failure can be inspected.
  let succeeded = false;
  const approvalId = 'live-490';
  try {
    await db.operator.createAccount({
      accountId: 'anthropic-owner',
      providerAccountRef: 'live-run-2026-10-31',
      globalDailyCeilingMicros: MICROS,
      authorization: AUTH,
    });
    await db.operator.createApproval({
      approvalId,
      accountId: 'anthropic-owner',
      grantReference: 'owner-live-490',
      stage: '490',
      ceilings: {
        stageMicros: MICROS,
        campaignDailyMicros: MICROS,
        playSessionMicros: MICROS,
        evaluationRunMicros: MICROS,
      },
      campaignIds: ['ravenford'],
      authorization: AUTH,
    });
    await setMonetaryPolicy(db.pool, {
      scope: 'text',
      accountId: 'anthropic-owner',
      mode: 'UNLIMITED',
      authorization: AUTH,
    });

    const store = new PostgresWorkshopStore(db.pool),
      packages = new PostgresCampaignRevisionRepository(db.pool),
      images = new PostgresDraftImageRepository(db.pool),
      controls = new PostgresCampaignRevisionControlRepository(db.pool),
      generation = new PostgresCampaignGenerationRepository(db.pool),
      edits = new PostgresCampaignGenerationRepository(db.pool, 'EDIT');
    const preparation = createCampaignPreparationRuntime(
      {
        ...loadConfig({}).ai,
        approvalId,
        routes: { 'campaign-preparation': ['anthropic:claude-sonnet-5-5'] },
        anthropic: { apiKey: new Secret(apiKey), model: 'claude-sonnet-5-5', timeoutMs: 240_000 },
        requestTimeoutMs: 300_000,
        preparationTimeoutMs: 1_200_000,
      },
      {
        pool: db.pool,
        budget: new PostgresBudgetStore(db.pool, identityResolver(VERIFIED_CATALOG)),
        catalog: VERIFIED_CATALOG,
        approvalStored: true,
        tasks,
      },
    );
    const publication = new PostgresCampaignPublication(db.pool),
      engine = createWorldEngine(db.pool, publication),
      bootstrap = createRawWorldEngine(db.pool),
      initialContent = new PostgresCampaignInitialContentStore(db.pool),
      contents = new PostgresAssetContentStore(db.pool),
      credentials = new PostgresCredentialStore(db.pool);
    const signIn: SignInDependencies = {
      publication,
      credentials,
      publicOrigin: ORIGIN,
      clock: systemAuthClock,
      limits: new RequestLimits(SIGN_IN_LIMITS, Date.now),
      evidence: evidenceHasher(),
    };
    const activation = {
      repository: new PostgresCampaignActivationRepository(db.pool),
      initialContent,
      contents,
      draftImages: images,
      bootstrap,
    };
    const generationWorker = new CampaignGenerationWorker({ repository: generation, preparation });
    const workshop: WorkshopDependencies = {
      store,
      packages,
      revisionControls: controls,
      generation: { repository: generation, preparation },
      edits: { repository: edits, preparation },
      cancelGeneration: (id) => {
        generationWorker.cancel(id);
      },
      cancelEdit: () => undefined,
      images: {
        repository: images,
        runtime: {
          availability: () =>
            Promise.resolve({
              available: false as const,
              reason: 'NO_ROUTE' as const,
              provider: null,
              model: null,
            }),
          prepare: () => Promise.resolve({ status: 'UNAVAILABLE' as const, reason: 'NO_ROUTE' }),
          forJob: () => Promise.resolve(null),
        },
      },
      activation,
      campaignEntry: { engine, signIn },
      clock: systemAuthClock,
      publicOrigin: ORIGIN,
      limits: new RequestLimits({ ...SIGN_IN_LIMITS, expensivePerMinute: 100 }, Date.now),
    };
    const app = buildApp({
      engine,
      authenticator: sessionAuthenticator(credentials, systemAuthClock),
      signIn,
      logger: createLogger({ service: 'live-490', level: 'silent' }),
      ai: testAiGateway(),
      authoring: testAuthoring(),
      dm: testDm(),
      assets: { contents },
      quests: [],
      campaignQuests: createCampaignQuestBooks(initialContent),
      workshop,
    });
    await app.ready();
    ownerId = randomUUID();
    const invitation = await issueWorkshopInvitation(workshop, {
      ownerId,
      hours: 1,
      authorizationSource: AUTHORIZATION_FILE,
    });
    const redeemed = await app.inject({
      method: 'POST',
      url: '/workshop/auth/redeem',
      headers: { origin: ORIGIN },
      payload: { token: tokenOfLink(invitation.link) },
    });
    const raw = redeemed.headers['set-cookie'];
    const cookie = (typeof raw === 'string' ? raw : raw?.[0])?.split(';')[0];
    if (redeemed.statusCode !== 200 || !cookie) throw new Error('LIVE_REDEEM_FAILED');
    const send = (method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({
        method,
        url,
        headers: { origin: ORIGIN, cookie, 'x-workshop-owner': ownerId },
        ...(payload ? { payload } : {}),
      });
    await grantPreparationApproval(db.pool, {
      approvalId,
      ownerId,
      enabled: true,
      authorization: AUTH,
    });

    const draft = await send('POST', '/workshop/drafts', {
      requestId: randomUUID(),
      title: 'Живой прогон: порт и сети',
      language: 'ru',
    });
    if (draft.statusCode !== 200) throw new Error('LIVE_DRAFT_FAILED');
    const draftId = draft.json<{ draftId: string }>().draftId;
    const url = `/workshop/drafts/${draftId}`;
    const accepted = await send('POST', `${url}/generation`, {
      requestId: randomUUID(),
      basedOnRevision: 0,
      brief: BRIEF,
    });
    if (accepted.statusCode !== 200)
      throw new Error(`LIVE_GENERATION_REFUSED ${accepted.statusCode}`);
    const job = accepted.json<{ job: CampaignGenerationJob }>().job;
    const started = Date.now();
    await generationWorker.run({ ownerId, draftId, jobId: job.jobId });
    await tasks.idle();
    const elapsedMs = Date.now() - started;

    const view = (
      await send('GET', `${url}/generation/${job.jobId}`)
    ).json<CampaignGenerationView>();
    const revision = (await send('GET', `${url}/package`)).json<CampaignRevisionView>();
    const content = revision.revision?.content;
    const possessions = content?.possessions ?? [];
    const itemKeys = new Set(content?.entities.filter((e) => e.kind === 'item').map((e) => e.key));
    const summary = {
      model: 'claude-sonnet-5-5',
      elapsedMs,
      job: view.job,
      readiness: revision.assessment.readiness,
      findingCounts: revision.assessment.findings.reduce<Record<string, number>>(
        (counts, finding) => {
          const key = `${finding.severity}:${finding.code}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        },
        {},
      ),
      counts: revision.assessment.counts,
      possessionsReturned: possessions.length,
      possessionsReferToItems: possessions.every((row) => itemKeys.has(row.item)),
      catalogIdsUsed: [
        ...new Set(possessions.flatMap((row) => (row.catalog ? [row.catalog] : []))),
      ],
    };
    succeeded = view.job.status === 'SUCCEEDED';
    await write('summary.json', summary);
    await write('possessions.json', possessions);
    await write('assessment.json', revision.assessment);
    await write('revision-content.json', content ?? null);
    say(JSON.stringify(summary));
  } finally {
    try {
      if (ownerId)
        await grantPreparationApproval(db.pool, {
          approvalId,
          ownerId,
          enabled: false,
          authorization: AUTH,
        });
      await tasks.idle();
      const spend = await spendReport(db.pool);
      await writeFile(
        join(EVIDENCE_DIR, 'spend.json'),
        `${JSON.stringify(spend, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`,
      );
      const rows = await db.pool.query(
        `SELECT c.kind, count(*)::int AS n, coalesce(sum(c.charge_micros),0)::text AS micros
         FROM ltw_ai_accounting c WHERE c.kind <> 'evidence' GROUP BY c.kind ORDER BY c.kind`,
      );
      await writeFile(
        join(EVIDENCE_DIR, 'accounting.json'),
        `${JSON.stringify(rows.rows, null, 2)}\n`,
      );
      const open = await db.pool.query(
        `SELECT count(*)::int AS n FROM ltw_ai_attempts a WHERE NOT EXISTS
           (SELECT 1 FROM ltw_ai_accounting c WHERE c.attempt_id = a.attempt_id AND c.kind <> 'evidence')`,
      );
      keepDatabase = (open.rows[0] as { n: number }).n > 0 || !succeeded;
    } catch (error) {
      keepDatabase = true;
      say(
        `evidence export failed; the database is kept: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    await tasks.shutdown();
    if (keepDatabase) {
      await db.pool.end();
      say(`database kept (open holds or failed export): ${db.database.name}`);
    } else await db.close();
  }
}
main().catch((error: unknown) => {
  say(`live run failed: ${error instanceof Error ? error.message : 'unknown'}`);
  process.exitCode = 1;
});
