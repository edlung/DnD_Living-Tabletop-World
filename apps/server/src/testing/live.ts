import type { LiveMessage } from '@ltw/contracts';
import type { Actor, WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';

import { loadDevPersonaAuthenticator, type Authenticator } from '../http/auth.ts';
import type { LiveLimits, LiveTimers } from '../live/hub.ts';
import { buildLiveApp } from '../live/live-app.ts';
import { DEFAULT_PERSONAS_FILE } from '../platform/config/config.ts';
import { createLogger, type Logger } from '../platform/logging/logger.ts';
import {
  RAVENFORD_QUESTS,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
} from './ravenford-app.ts';

/** Test support (docs/adr/0033-live-session.md): the live app over Ravenford, on a manual clock. */
export class ManualTimers implements LiveTimers {
  #time = 0;
  readonly #tasks: { at: number; run: () => void; done: boolean }[] = [];

  now = (): number => this.#time;

  after = (ms: number, run: () => void): (() => void) => {
    const task = { at: this.#time + ms, run, done: false };
    this.#tasks.push(task);
    return () => {
      task.done = true;
    };
  };

  /** Delays of the scheduled tasks, from now. */
  pending(): number[] {
    return this.#tasks.filter((task) => !task.done).map((task) => task.at - this.#time);
  }

  /** Moves the clock forward, running each task that falls due in time order. */
  advance(ms: number): void {
    const end = this.#time + ms;
    for (;;) {
      const [due] = this.#tasks
        .filter((task) => !task.done && task.at <= end)
        .sort((a, b) => a.at - b.at);
      if (!due) break;
      this.#time = due.at;
      due.done = true;
      due.run();
    }
    this.#time = end;
  }
}

/** Resolves a token to whatever actor the test currently says, or to nobody. */
export function flippableAuthenticator(initial: Readonly<Record<string, string | null>>) {
  const actors = new Map(Object.entries(initial));
  const authenticator: Authenticator = {
    authenticate(authorization) {
      const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
      const actorId = token === undefined ? null : (actors.get(token) ?? null);
      return actorId === null ? null : ({ actorId, kind: 'user' } satisfies Actor);
    },
  };
  return {
    authenticator,
    flip: (token: string, actorId: string | null) => {
      actors.set(token, actorId);
    },
  };
}

export interface LiveRavenford {
  readonly app: FastifyInstance;
  readonly hub: ReturnType<typeof buildLiveApp>['hub'];
  readonly timers: ManualTimers;
  readonly engine: WorldEngine;
}

export async function liveRavenford(
  options: {
    readonly engine?: WorldEngine;
    readonly authenticator?: Authenticator;
    readonly limits?: Partial<LiveLimits>;
    readonly logger?: Logger;
  } = {},
): Promise<LiveRavenford> {
  const timers = new ManualTimers();
  const engine = options.engine ?? (await seededEngine());
  const { app, hub } = buildLiveApp(
    {
      ai: testAiGateway(),
      authoring: testAuthoring(),
      assets: testAssets(),
      quests: RAVENFORD_QUESTS,
      engine,
      authenticator:
        options.authenticator ?? (await loadDevPersonaAuthenticator(DEFAULT_PERSONAS_FILE)),
      logger: options.logger ?? createLogger({ service: 'live-test', level: 'silent' }),
    },
    { timers, ...(options.limits ? { limits: options.limits } : {}) },
  );
  await app.ready();
  return { app, hub, timers, engine };
}

export interface LiveStream {
  readonly status: number;
  readonly headers: Readonly<Record<string, unknown>>;
  /** Every frame received so far, heartbeats included, in order. */
  frames(): string[];
  /** The messages received so far (heartbeats excluded). */
  messages(): LiveMessage[];
  /** The full body of a refused (non-200) request. */
  body(): Promise<unknown>;
  ended(): boolean;
  /** Waits until `check` holds after some received data (or the end). */
  until(check: () => boolean, ms?: number): Promise<void>;
  /** The client goes away. */
  disconnect(): void;
}

function parse(frame: string): LiveMessage | null {
  const event = /^event: (\w+)$/m.exec(frame)?.[1];
  const data = /^data: (.*)$/m.exec(frame)?.[1];
  if (event === undefined || data === undefined) return null;
  return { type: event, ...(JSON.parse(data) as object) } as LiveMessage;
}

/** Opens `url` like the browser does: a GET with the bearer token, read as a stream. */
export async function openLive(
  app: FastifyInstance,
  url: string,
  token?: string,
): Promise<LiveStream> {
  const response = await app.inject({
    method: 'GET',
    url,
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    payloadAsStream: true,
  });
  const stream = response.stream();
  let text = '';
  let ended = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  stream.on('data', (chunk: Buffer) => {
    text += chunk.toString('utf8');
    notify();
  });
  const finish = () => {
    ended = true;
    notify();
  };
  stream.on('end', finish);
  stream.on('error', finish);
  stream.on('close', finish);
  const frames = () =>
    text
      .split('\n\n')
      .slice(0, -1)
      .map((frame) => `${frame}\n\n`);
  const until = (check: () => boolean, ms = 5_000) =>
    new Promise<void>((resolve, reject) => {
      if (check()) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`live stream condition not met; frames: ${JSON.stringify(frames())}`));
      }, ms);
      const listener = () => {
        if (!check()) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve();
      };
      listeners.add(listener);
    });
  return {
    status: response.statusCode,
    headers: response.headers,
    frames,
    messages: () => frames().flatMap((frame) => parse(frame) ?? []),
    body: async () => {
      await until(() => ended);
      return JSON.parse(text) as unknown;
    },
    ended: () => ended,
    until,
    disconnect: () => {
      (response.raw as unknown as { res: { destroy(): void } }).res.destroy();
    },
  };
}

/** Lets written frames reach the reading side. */
export const delivered = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Opens a stream and waits for its `ready`. */
export async function readyLive(
  app: FastifyInstance,
  url: string,
  token: string,
): Promise<LiveStream> {
  const stream = await openLive(app, url, token);
  await stream.until(() => stream.messages().some((message) => message.type === 'ready'));
  return stream;
}
