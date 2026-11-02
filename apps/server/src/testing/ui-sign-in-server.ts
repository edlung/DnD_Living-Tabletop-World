import { ACCOUNT_LIMITS, AccountLimits } from '../accounts/account-limits.ts';
import { InMemoryAccountStore } from '../accounts/account-store.ts';
import { InMemoryCredentialStore } from '../auth/credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { sessionAuthenticator, systemAuthClock } from '../auth/session-authenticator.ts';
import type { SignInDependencies } from '../auth/sign-in.ts';
import { evidenceHasher } from '../auth/tokens.ts';
import { PublishedEventStore } from '../campaigns/published-event-store.ts';
import { createCampaignQuestBooks } from '../campaigns/quest-books.ts';
import { buildLiveApp } from '../live/live-app.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  RAVENFORD_QUESTS,
  RAVENFORD_QUESTS_BY_LANGUAGE,
  RAVENFORD_PREPARED,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
  MIDDLE_ENTROPY,
} from './ravenford-app.ts';
import { seedDmInvitations, seedSignInCampaigns } from './ui-sign-in-campaigns.ts';
import { SIGN_IN_ORIGIN, SIGN_IN_PORTS, signInSeed } from './ui-sign-in-links.ts';
import { WORKSHOP_FIXTURES, workshopOwnerId } from './ui-workshop-links.ts';
import { seedWorkshopAccess } from './ui-workshop-fixtures.ts';

/**
 * Browser-test composition in invitation mode (docs/adr/0036-production-sign-in.md;
 * tests/e2e/AGENTS.md): production sign-in — session cookies, accounts (ADR 0041, in memory),
 * the sign-in and member routes,
 * the origin check, limits, the live stream on the cookie — over the real World Engine with
 * in-memory credentials, behind the second Vite server (`SIGN_IN_ORIGIN`, which is therefore
 * the public origin). A test-only scripted workshop worker is composed here; no remote AI.
 * Redeem limits are raised, since every
 * journey's browser is the same loopback client (the limits have their own server tests).
 * Localhost only; never used by the production entry point.
 */
const seed = signInSeed();
const rawStore = new InMemoryEventStore();
const bootstrap = await seedSignInCampaigns(rawStore);
const credentials = new InMemoryCredentialStore();
await seedDmInvitations(credentials, seed);
const baseSignIn: SignInDependencies = {
  credentials,
  publicOrigin: SIGN_IN_ORIGIN,
  clock: systemAuthClock,
  limits: new RequestLimits(
    {
      ...SIGN_IN_LIMITS,
      redeemPerMinute: 1_000,
      failuresPerHour: 1_000,
      refusedRedeemsPerMinute: 1_000,
    },
    () => Date.now(),
  ),
  evidence: evidenceHasher(),
  // Accounts (ADR 0041), their limits raised like the redeem limits: one loopback client.
  accounts: new InMemoryAccountStore(),
  accountLimits: new AccountLimits(
    {
      ...ACCOUNT_LIMITS,
      signInPerMinute: 1_000,
      accountsPerHour: 1_000,
      campaignsPerHour: 1_000,
    },
    () => Date.now(),
  ),
};
const assets = testAssets();
const { workshop, stopGeneration, activationFixture } = await seedWorkshopAccess(
  credentials,
  bootstrap,
  seed,
  { bootstrap, contents: assets.contents },
);
if (!activationFixture) throw new Error('UI_ACTIVATION_NOT_COMPOSED');
const engine = new WorldEngine({
  store: new PublishedEventStore(rawStore, activationFixture.publication),
  ids: new SequentialIds(500000),
  clock: new SteppingClock(),
  combat: createCombatEngine(),
  checks: skillCheckPort(scriptedDice(Array<number>(1024).fill(15))),
  entropy: MIDDLE_ENTROPY,
});
const signIn = { ...baseSignIn, publication: activationFixture.publication };
const { app } = buildLiveApp({
  ai: testAiGateway(),
  authoring: testAuthoring(),
  dm: testDm(),
  assets,
  quests: RAVENFORD_QUESTS,
  questsByLanguage: RAVENFORD_QUESTS_BY_LANGUAGE,
  preparedEncounters: RAVENFORD_PREPARED,
  campaignQuests: createCampaignQuestBooks(activationFixture.initialContent),
  engine,
  authenticator: sessionAuthenticator(credentials, systemAuthClock),
  logger: createLogger({ service: 'ui-sign-in-test', level: 'silent' }),
  signIn,
  workshop: { ...workshop, campaignEntry: { engine, signIn } },
  trustedProxies: [],
});
app.addHook('onClose', async () => {
  await stopGeneration();
});
app.post('/testing/workshop-activation-release', async (_request, reply) => {
  activationFixture.releasePending();
  return reply.send({ released: true });
});

// Test-process-only operator revocation trigger; never imported by production composition.
app.post<{ Params: { name: string } }>('/testing/workshop-revoke/:name', async (request, reply) => {
  const name = WORKSHOP_FIXTURES.find((candidate) => candidate === request.params.name);
  if (!name) return reply.code(404).send({});
  await workshop.store.revokeOwner(
    workshopOwnerId(seed, name),
    new Date().toISOString(),
    'browser-test:revocation',
  );
  return reply.send({ revoked: true });
});

await app.listen({ host: '127.0.0.1', port: SIGN_IN_PORTS.api });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
import { createCombatEngine } from '@ltw/combat';
import { InMemoryEventStore, WorldEngine, SequentialIds, SteppingClock } from '@ltw/domain';
import { scriptedDice, skillCheckPort } from '@ltw/rules';
