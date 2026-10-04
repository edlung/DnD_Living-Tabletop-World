import { SequentialIds, SteppingClock, WorldEngine, type EventStore } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { testAiGateway, testAuthoring } from '../testing/ravenford-app.ts';
import { buildApp } from './app.ts';
import { devPersonaAuthenticator, disabledAuthenticator } from './auth.ts';

const personas = {
  personas: [
    { token: 'dev-test-token', actorId: 'tester', description: 'test' },
    { token: 'dev-other-token', actorId: 'other', description: 'test' },
  ],
};

function appWith(store: EventStore, lines: Record<string, unknown>[] = []) {
  const logger = createLogger({
    service: 'app-test',
    level: 'debug',
    destination: {
      write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>),
    },
  });
  const engine = new WorldEngine({ store, ids: new SequentialIds(), clock: new SteppingClock() });
  return buildApp({
    engine,
    authenticator: devPersonaAuthenticator(personas),
    logger,
    ai: testAiGateway(),
    authoring: testAuthoring(),
  });
}

const failingStore: EventStore = {
  loadStream: () => Promise.reject(new Error('connection refused: postgres://user:secret@db/ltw')),
  findCommand: () => Promise.reject(new Error('down')),
  loadCommands: () => Promise.reject(new Error('down')),
  append: () => Promise.reject(new Error('down')),
};

describe('HTTP app', () => {
  it('serves liveness without authentication', async () => {
    const app = appWith(failingStore);
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes and methods with a uniform JSON 404', async () => {
    const app = appWith(failingStore);
    for (const [method, url] of [
      ['GET', '/nothing'],
      ['DELETE', '/campaigns/ravenford/knowledge'],
      ['GET', '/campaigns/ravenford/world'],
    ] as const) {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
  });

  it('hides internal failures from callers but logs them with the request ID', async () => {
    const lines: Record<string, unknown>[] = [];
    const app = appWith(failingStore, lines);
    const response = await app.inject({
      method: 'GET',
      url: '/campaigns/ravenford/knowledge?perspective=PUBLIC',
      headers: { authorization: 'Bearer dev-test-token' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal error' },
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toMatch(/postgres|secret|connection|stack/i);
    const failure = lines.find((line) => line['msg'] === 'request failed');
    expect(failure?.['requestId']).toBe(response.headers['x-request-id']);
    expect(JSON.stringify(lines)).not.toContain('Bearer dev-test-token');
  });

  it('refuses everyone when authentication is disabled', async () => {
    const app = buildApp({
      engine: new WorldEngine({
        store: failingStore,
        ids: new SequentialIds(),
        clock: new SteppingClock(),
      }),
      authenticator: disabledAuthenticator,
      logger: createLogger({ service: 'app-test', level: 'silent' }),
      ai: testAiGateway(),
      authoring: testAuthoring(),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/campaigns/ravenford/knowledge?perspective=PUBLIC',
      headers: { authorization: 'Bearer dev-test-token' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('devPersonaAuthenticator', () => {
  it('maps bearer tokens to user actors only', () => {
    const auth = devPersonaAuthenticator(personas);
    expect(auth.authenticate('Bearer dev-test-token')).toEqual({ actorId: 'tester', kind: 'user' });
    expect(auth.authenticate('Bearer dev-test-tokenX')).toBeNull();
    expect(auth.authenticate(undefined)).toBeNull();
    expect(auth.authenticate('dev-test-token')).toBeNull();
  });

  it('refuses ambiguous persona files', () => {
    const duplicate = {
      personas: [...personas.personas, { token: 'dev-test-token', actorId: 'x', description: '' }],
    };
    expect(() => devPersonaAuthenticator(duplicate)).toThrow(/unique/);
  });
});
