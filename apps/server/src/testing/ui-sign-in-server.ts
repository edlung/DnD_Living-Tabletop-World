import { InMemoryCredentialStore } from '../auth/credential-store.ts';
import { RequestLimits, SIGN_IN_LIMITS } from '../auth/limits.ts';
import { sessionAuthenticator, systemAuthClock } from '../auth/session-authenticator.ts';
import type { SignInDependencies } from '../auth/sign-in.ts';
import { evidenceHasher } from '../auth/tokens.ts';
import { buildLiveApp } from '../live/live-app.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  RAVENFORD_QUESTS,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from './ravenford-app.ts';
import { seedDmInvitations, seedSignInCampaigns } from './ui-sign-in-campaigns.ts';
import { SIGN_IN_ORIGIN, SIGN_IN_PORTS, signInSeed } from './ui-sign-in-links.ts';
import { WORKSHOP_FIXTURES, workshopOwnerId } from './ui-workshop-links.ts';
import { seedWorkshopAccess } from './ui-workshop-fixtures.ts';

/**
 * Browser-test composition in invitation mode (docs/adr/0036-production-sign-in.md;
 * tests/e2e/AGENTS.md): production sign-in — session cookies, the sign-in and member routes,
 * the origin check, limits, the live stream on the cookie — over the real World Engine with
 * in-memory credentials, behind the second Vite server (`SIGN_IN_ORIGIN`, which is therefore
 * the public origin). A test-only scripted workshop worker is composed here; no remote AI.
 * Redeem limits are raised, since every
 * journey's browser is the same loopback client (the limits have their own server tests).
 * Localhost only; never used by the production entry point.
 */
const seed = signInSeed();
const engine = await seedSignInCampaigns();
const credentials = new InMemoryCredentialStore();
await seedDmInvitations(credentials, seed);
const signIn: SignInDependencies = {
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
};
const { workshop, stopGeneration } = await seedWorkshopAccess(credentials, engine, seed);
const { app } = buildLiveApp({
  ai: testAiGateway(),
  authoring: testAuthoring(),
  dm: testDm(),
  assets: testAssets(),
  quests: RAVENFORD_QUESTS,
  engine,
  authenticator: sessionAuthenticator(credentials, systemAuthClock),
  logger: createLogger({ service: 'ui-sign-in-test', level: 'silent' }),
  signIn,
  workshop,
  trustedProxies: [],
});
app.addHook('onClose', async () => {
  await stopGeneration();
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
