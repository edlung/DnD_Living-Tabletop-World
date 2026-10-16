import { InMemoryEventStore, SequentialIds, SteppingClock, WorldEngine } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { readinessProbe, type ReadinessProbe } from '../platform/health/readiness.ts';
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

/** `GET /readyz` (docs/adr/0037-deployment.md §3): status codes, fixed bodies, no internals. */
const silent = createLogger({ service: 'readiness-route-test', level: 'silent' });

function appWith(readiness?: ReadinessProbe, logger = silent) {
  return buildApp({
    engine: new WorldEngine({
      store: new InMemoryEventStore(),
      ids: new SequentialIds(),
      clock: new SteppingClock(),
    }),
    authenticator: disabledAuthenticator,
    logger,
    ai: testAiGateway(),
    authoring: testAuthoring(),
    dm: testDm(),
    assets: testAssets(),
    quests: RAVENFORD_QUESTS,
    ...(readiness === undefined ? {} : { readiness }),
  });
}

describe('GET /readyz', () => {
  it('answers 200 when every check holds, without authentication and never cached', async () => {
    const app = appWith(() => Promise.resolve({ ready: true, failed: [] }));
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers 503 naming only the failed checks', async () => {
    const app = appWith(() => Promise.resolve({ ready: false, failed: ['migrations'] }));
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', failed: ['migrations'] });
  });

  it('never reveals why a check failed', async () => {
    const failing = () =>
      Promise.reject(new Error('password authentication failed: postgres://ltw:secret@db/ltw'));
    const app = appWith(
      readinessProbe(
        { database: failing, migrations: failing, eventStore: failing },
        { logger: silent },
      ),
    );
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'not_ready',
      failed: ['database', 'migrations', 'eventStore'],
    });
    expect(response.body).not.toMatch(/secret|password|postgres/);
  });

  it('is ready in a composition without external stores, beside /healthz', async () => {
    const app = appWith();

    expect((await app.inject({ method: 'GET', url: '/readyz' })).json()).toEqual({
      status: 'ready',
    });
    expect((await app.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({
      status: 'ok',
    });
  });

  it('keeps frequent health checks out of the request log', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({
      service: 'readiness-route-test',
      level: 'info',
      destination: {
        write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>),
      },
    });
    const app = appWith(undefined, logger);
    await app.inject({ method: 'GET', url: '/readyz' });
    await app.inject({ method: 'GET', url: '/healthz' });
    expect(lines).toEqual([]);

    await app.inject({ method: 'GET', url: '/elsewhere' });
    expect(lines.map((line) => line['msg'])).toContain('request completed');
  });

  it('accepts GET only', async () => {
    const app = appWith();
    const response = await app.inject({ method: 'POST', url: '/readyz' });

    expect(response.statusCode).toBe(404);
  });
});
