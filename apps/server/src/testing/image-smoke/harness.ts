import {
  createPlaceholderImageGenerator,
  type ImageGenerator,
  type InMemoryAiTraceStore,
} from '@ltw/ai';
import type { CommandResult } from '@ltw/contracts';
import { InMemoryEventStore, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';

import { InMemoryAssetContentStore } from '../../assets/content-store.ts';
import { AssetWorker } from '../../assets/worker.ts';
import type { ImageBudgetStatus } from '../../images/ledger.ts';
import type { ImageChargeRecord } from '../../images/ledger-operator.ts';
import { createLogger } from '../../platform/logging/logger.ts';
import {
  TOKENS,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
} from '../ravenford-app.ts';
import { parseSmokeArgs } from './args.ts';
import { SmokeClient, type SmokeContext } from './client.ts';
import type { SmokeStore } from './store.ts';

/**
 * Test support for the image smoke (`run.test.ts`): the production HTTP app over a seeded
 * in-memory Ravenford, reached through an injected `fetch`; the asset worker runs whenever the
 * smoke waits, as the server's loop would; the database reads come from the same in-memory stores,
 * and the image ledger is whatever the test sets.
 */
export const NO_BUDGET: ImageBudgetStatus = {
  revision: null,
  ceilingMicros: null,
  spentMicros: '0',
  heldMicros: '0',
  remainingMicros: null,
  charges: 0,
  unsettled: 0,
};

export interface SmokeHarness {
  readonly app: FastifyInstance;
  readonly engine: WorldEngine;
  readonly events: InMemoryEventStore;
  readonly contents: InMemoryAssetContentStore;
  readonly traces: InMemoryAiTraceStore;
  readonly lines: string[];
  /** Whether waiting runs the asset worker (the server's loop). */
  workerRuns: boolean;
  budget: ImageBudgetStatus;
  readonly charges: Map<string, ImageChargeRecord[]>;
  /** False: the smoke reads another database than the server's. */
  sameDatabase: boolean;
  context(args?: readonly string[]): SmokeContext;
  dm(command: Record<string, unknown>): Promise<CommandResult>;
}

/** Routes the smoke's requests into the app; the URL's origin is ignored. */
function injectedFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const reply = await app.inject({
      method: init?.method === 'POST' ? 'POST' : 'GET',
      url: `${url.pathname}${url.search}`,
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    const type = reply.headers['content-type'];
    return new Response(new Uint8Array(reply.rawPayload), {
      status: reply.statusCode,
      headers: typeof type === 'string' ? { 'content-type': type } : {},
    });
  };
}

export async function smokeHarness(
  options: { readonly generator?: ImageGenerator; readonly fixturesDir?: string } = {},
): Promise<SmokeHarness> {
  const events = new InMemoryEventStore();
  const engine = await seededEngine(events, undefined, undefined, options.fixturesDir);
  const contents = new InMemoryAssetContentStore();
  const ai = testAiGateway();
  const app = await ravenfordApp(engine, ai, testAuthoring(), contents);
  const worker = new AssetWorker({
    engine,
    contents,
    generator: options.generator ?? createPlaceholderImageGenerator(),
    timeoutMs: 5_000,
    logger: createLogger({ service: 'image-smoke-test', level: 'silent' }),
  });
  let clock = 0;
  let commands = 0;
  let runs = 0;
  const harness: SmokeHarness = {
    app,
    engine,
    events,
    contents,
    traces: ai.traces,
    lines: [],
    workerRuns: true,
    budget: NO_BUDGET,
    charges: new Map(),
    sameDatabase: true,
    context: (args = ['--generator', 'placeholder']) => ({
      options: parseSmokeArgs([...args, '--server', 'http://127.0.0.1:4399']),
      client: new SmokeClient(
        new URL('http://127.0.0.1:4399'),
        { dm: TOKENS.dm, player: TOKENS.player },
        injectedFetch(app),
      ),
      store,
      log: (line) => harness.lines.push(line),
      sleep: async (ms) => {
        clock += ms;
        if (harness.workerRuns) await worker.runOnce('ravenford');
      },
      now: () => clock,
      runId: `image-smoke.test${String((runs += 1))}`,
    }),
    dm: async (command) => {
      commands += 1;
      return engine.execute({
        commandId: `harness.${String(commands)}`,
        campaignId: 'ravenford',
        actor: { actorId: 'dm-ravenford', kind: 'user' },
        command,
      });
    },
  };
  const store: SmokeStore = {
    budget: () => Promise.resolve(harness.budget),
    charges: (_campaignId, requestId) => Promise.resolve(harness.charges.get(requestId) ?? []),
    openReservations: () => Promise.resolve([]),
    campaignRecorded: async (campaignId) => (await events.loadStream(campaignId)) !== null,
    eventRecorded: async (campaignId, eventId) =>
      harness.sameDatabase &&
      ((await events.loadStream(campaignId))?.events.some((e) => e.eventId === eventId) ?? false),
    storedContent: async (campaignId, contentHash) => {
      const stored = await contents.get(campaignId, contentHash);
      return stored ? { mediaType: stored.mediaType, size: stored.bytes.byteLength } : null;
    },
    close: () => Promise.resolve(),
  };
  return harness;
}
