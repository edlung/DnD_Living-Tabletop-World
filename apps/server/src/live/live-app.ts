import type { FastifyInstance } from 'fastify';

import {
  buildApp,
  credentialHeaderOf,
  memoryChat,
  memoryHandouts,
  memoryTable,
  type AppDependencies,
} from '../http/app.ts';
import { memoryLobby } from '../table/table-state.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { fingerprintSubscription } from './fingerprint.ts';
import { LIVE_LIMITS, LiveHub, systemTimers, type LiveLimits, type LiveTimers } from './hub.ts';
import { registerLiveRoute } from './live-routes.ts';
import { LiveRegistry } from './registry.ts';

/**
 * The HTTP application with the live session (docs/adr/0033-live-session.md), for every
 * composition (`main.ts`, `testing/ravenford-app.ts`). Fingerprints come from a second
 * instance of the same application built from the same engine, stores and authenticator, with
 * a silent logger: it serves only injected requests, registers no live route of its own,
 * starts no worker, and is built on the first subscription and closed with the application.
 * Closing the application first ends every stream with `shutdown`.
 */
export interface LiveAppOptions {
  readonly limits?: Partial<LiveLimits>;
  readonly timers?: LiveTimers;
}

export function buildLiveApp(
  deps: Omit<AppDependencies, 'presence'>,
  options: LiveAppOptions = {},
): { readonly app: FastifyInstance; readonly hub: LiveHub } {
  const limits = { ...LIVE_LIMITS, ...options.limits };
  const timers = options.timers ?? systemTimers;
  const registry = new LiveRegistry({
    now: () => timers.now(),
    graceMs: limits.graceMs,
    perActor: limits.perActor,
    perProcess: limits.perProcess,
  });
  // One table for the application and its fingerprint twin, so a roll signals its viewers.
  const shared: AppDependencies = {
    ...deps,
    table: deps.table ?? memoryTable(),
    // And one lobby: a pause or a "ready" signals its viewers too (ADR 0043 §6).
    lobby: deps.lobby ?? memoryLobby(),
    // And one chat, so a message signals its readers (ADR 0044 §1).
    chat: deps.chat ?? memoryChat(),
    // And one set of handouts, so a new one signals its readers (ADR 0044 §5).
    handouts: deps.handouts ?? memoryHandouts(),
    presence: registry,
  };
  const app = buildApp(shared);
  let mirror: FastifyInstance | null = null;
  const twin = () =>
    (mirror ??= buildApp({
      ...shared,
      logger: createLogger({ service: 'live-fingerprint', level: 'silent' }),
    }));
  const hub = new LiveHub({
    registry,
    timers,
    limits,
    logger: deps.logger,
    fingerprint: (subscription) =>
      fingerprintSubscription(twin(), deps.authenticator, subscription),
  });
  registerLiveRoute(app, {
    engine: deps.engine,
    authenticator: deps.authenticator,
    hub,
    credentialHeader: credentialHeaderOf(deps),
  });
  app.addHook('preClose', async () => {
    await hub.shutdown();
  });
  app.addHook('onClose', async () => {
    await mirror?.close();
  });
  return { app, hub };
}
