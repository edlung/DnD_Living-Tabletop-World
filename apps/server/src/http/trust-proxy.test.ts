import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import type { TrustProxy } from '../platform/config/config.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  RAVENFORD_QUESTS,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from '../testing/ravenford-app.ts';
import { buildApp } from './app.ts';
import { disabledAuthenticator } from './auth.ts';

/**
 * The client address behind the deployment's proxy (docs/adr/0037-deployment.md;
 * `LTW_TRUST_PROXY`): per-address limits read `request.ip`, so only the proxy's network may name
 * the client in `X-Forwarded-For`, and a header from anyone else is ignored.
 */
const PROXY_NETWORK = '10.231.250.0/24';
const PROXY = '10.231.250.3';
const CLIENT = '203.0.113.7';
const STRANGER = '198.51.100.9';

function appWith(trustProxy?: TrustProxy) {
  const app = buildApp({
    engine: new WorldEngine({
      store: new InMemoryEventStore(),
      ids: new SequentialIds(),
      clock: new SteppingClock(),
    }),
    authenticator: disabledAuthenticator,
    logger: createLogger({ service: 'trust-proxy-test', level: 'silent' }),
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: RAVENFORD_QUESTS,
    ...(trustProxy === undefined ? {} : { trustProxy }),
  });
  // Test only: what the application takes for the client's address.
  app.get('/test-only/client-address', (request) => ({ ip: request.ip }));
  return app;
}

async function clientAddress(
  trustProxy: TrustProxy | undefined,
  from: string,
  forwardedFor?: string,
): Promise<string> {
  const response = await appWith(trustProxy).inject({
    method: 'GET',
    url: '/test-only/client-address',
    remoteAddress: from,
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  });
  return response.json<{ ip: string }>().ip;
}

describe('the client address', () => {
  it('is the connecting peer when no proxy is trusted, whatever the header says', async () => {
    expect(await clientAddress(undefined, PROXY, CLIENT)).toBe(PROXY);
    expect(await clientAddress(false, STRANGER, CLIENT)).toBe(STRANGER);
  });

  it('comes from X-Forwarded-For only when the peer is the trusted proxy network', async () => {
    expect(await clientAddress([PROXY_NETWORK], PROXY, CLIENT)).toBe(CLIENT);
    expect(await clientAddress([PROXY_NETWORK], PROXY)).toBe(PROXY);
  });

  it('ignores a forged X-Forwarded-For from an untrusted peer', async () => {
    expect(await clientAddress([PROXY_NETWORK], STRANGER, CLIENT)).toBe(STRANGER);
    expect(await clientAddress([PROXY_NETWORK], STRANGER, `${PROXY}, ${CLIENT}`)).toBe(STRANGER);
  });

  it('trusts exactly the given number of hops', async () => {
    expect(await clientAddress(1, PROXY, `192.0.2.1, ${CLIENT}`)).toBe(CLIENT);
    expect(await clientAddress(2, PROXY, `192.0.2.1, ${CLIENT}`)).toBe('192.0.2.1');
  });

  it('takes the nearest untrusted address when a client forged part of the chain', async () => {
    // The proxy appended the real client behind whatever the client claimed.
    expect(await clientAddress([PROXY_NETWORK], PROXY, `192.0.2.1, ${CLIENT}`)).toBe(CLIENT);
  });
});
