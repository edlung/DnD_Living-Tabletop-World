import { randomUUID } from 'node:crypto';

import type { RelevanceDeps } from '@ltw/ai';
import type { QuestDefinition } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { AssetContentStore } from '../assets/content-store.ts';
import { registerAuthRoutes } from '../auth/auth-routes.ts';
import { registerMemberRoutes } from '../auth/member-routes.ts';
import type { SignInDependencies } from '../auth/sign-in.ts';
import type { AuthoringDependencies } from '../authoring/service.ts';
import { registerDmRoutes, type DmDependencies } from '../dm/dm-routes.ts';
import { registerPresenceRoutes } from '../live/presence.ts';
import { NOBODY_CONNECTED, type PresenceSource } from '../live/registry.ts';
import { processReadiness, type ReadinessProbe } from '../platform/health/readiness.ts';
import { LOG_SERIALIZERS, type Logger } from '../platform/logging/logger.ts';
import type { Authenticator } from './auth.ts';
import { sendError } from './errors.ts';
import { registerAiRoutes, type AiRouteDependencies } from './routes/ai-routes.ts';
import { registerAssetRoutes } from './routes/asset-routes.ts';
import { registerChronicleRoutes } from './routes/chronicle-routes.ts';
import { registerCharacterRoutes } from './routes/character-routes.ts';
import { registerAuthoringRoutes } from './routes/authoring-routes.ts';
import { registerCommandRoutes } from './routes/command-routes.ts';
import { registerContextRoutes } from './routes/context-routes.ts';
import { registerEncounterRoutes } from './routes/encounter-routes.ts';
import { registerKnowledgeRoutes } from './routes/knowledge-routes.ts';
import { registerMemoryRoutes } from './routes/memory-routes.ts';
import { registerNpcRoutes } from './routes/npc-routes.ts';
import { registerQuestRoutes } from './routes/quest-routes.ts';
import { registerReadinessRoute } from './routes/readiness-routes.ts';
import { registerSessionRoutes } from './routes/session-routes.ts';
import { registerSurroundingsRoutes } from './routes/surroundings-routes.ts';
import { registerUndoneRoutes } from './routes/undone-routes.ts';
import { registerVisualRoutes } from './routes/visual-routes.ts';
import { SECURITY_HEADERS, registerOriginCheck } from './security.ts';

/**
 * The server's HTTP application (docs/adr/0009-http-api-and-dev-authentication.md).
 * Request IDs are generated server-side (client `x-request-id` is ignored),
 * responses are never cacheable, and errors never reveal internals.
 */
export interface AppDependencies {
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
  readonly logger: Logger;
  /** The AI gateway (docs/adr/0017-ai-gateway.md): DM intents, NPC replies, relevance; no write path. */
  readonly ai: RelevanceDeps & AiRouteDependencies['ai'];
  /** Authoring proposals (docs/adr/0018-ai-authoring.md); commits go through the World Engine. */
  readonly authoring: AuthoringDependencies;
  /** The DM's substitution reasons (docs/adr/0033-live-session.md §6); descriptive, not canonical. */
  readonly dm: DmDependencies;
  /** Generated asset contents (docs/adr/0022-asset-identity.md); the worker runs outside requests. */
  readonly assets: { readonly contents: AssetContentStore };
  /** Quest definitions (docs/adr/0025-ravenford-integration.md §2); the log is a projection. */
  readonly quests: readonly QuestDefinition[];
  /**
   * Live subscriptions (docs/adr/0033-live-session.md §5), shared by the application and its
   * silent fingerprint twin (`src/live/live-app.ts`). Without a live session nobody is present.
   */
  readonly presence?: PresenceSource;
  /**
   * Production sign-in (docs/adr/0036-production-sign-in.md), invitation mode only: the
   * `/auth/*` routes, the DM's members and invitations, the origin check, request limits.
   * Absent with development personas, which behave as before.
   */
  readonly signIn?: SignInDependencies;
  /**
   * `LTW_TRUST_PROXY`: the reverse proxy's addresses or ranges (Fastify `trustProxy`), so
   * `request.ip` is the client its `X-Forwarded-For` names; empty or absent trusts none.
   */
  readonly trustedProxies?: readonly string[];
  /**
   * Readiness of the stores (docs/adr/0037-deployment.md §3), served as `/readyz`. Compositions
   * without external stores (tests, in-memory journeys) are ready while the process runs.
   */
  readonly readiness?: ReadinessProbe;
}

/** The request header that carries the credential: responses vary on it. */
export const credentialHeaderOf = (deps: Pick<AppDependencies, 'signIn'>) =>
  deps.signIn ? ('Cookie' as const) : ('Authorization' as const);

export function buildApp(input: AppDependencies): FastifyInstance {
  // Request limits apply in invitation mode (ADR 0036 §6); routes read them from their deps.
  const deps = input.signIn ? { ...input, limits: input.signIn.limits } : input;
  const vary = credentialHeaderOf(deps);
  // Typed as Fastify's base logger so routes share one instance type. Request lines carry the
  // method, URL and status only: never the client's address, a header or a cookie.
  const loggerInstance: FastifyBaseLogger = deps.logger.child({}, { serializers: LOG_SERIALIZERS });
  const proxies = deps.trustedProxies ?? [];
  const app = Fastify({
    loggerInstance,
    trustProxy: proxies.length > 0 ? [...proxies] : false,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    bodyLimit: 64 * 1024,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
    reply.header('vary', vary);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      // A route's own stricter policy (asset content) stays.
      if (!reply.hasHeader(name)) reply.header(name, value);
    }
  });
  if (deps.signIn) registerOriginCheck(app, deps.signIn.publicOrigin);

  app.setNotFoundHandler((request, reply) => sendError(reply, request, 'NOT_FOUND'));
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      request.log.info({ code: (error as { code?: unknown }).code }, 'request rejected');
      return sendError(reply, request, status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST');
    }
    request.log.error({ err: error }, 'request failed');
    return sendError(reply, request, 'INTERNAL');
  });

  // Health checks poll every few seconds: their requests log only warnings and errors.
  app.get('/healthz', { logLevel: 'warn' }, (_request, reply) => reply.send({ status: 'ok' }));
  registerReadinessRoute(app, deps.readiness ?? processReadiness);
  registerKnowledgeRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerCharacterRoutes(app, deps);
  registerMemoryRoutes(app, deps);
  registerContextRoutes(app, deps);
  registerSurroundingsRoutes(app, deps);
  registerEncounterRoutes(app, deps);
  registerCommandRoutes(app, deps);
  registerAiRoutes(app, deps);
  registerNpcRoutes(app, deps);
  registerAuthoringRoutes(app, deps);
  registerAssetRoutes(app, deps);
  registerVisualRoutes(app, deps);
  registerChronicleRoutes(app, { ...deps, chronicleIds: deps.authoring.ids });
  registerQuestRoutes(app, deps);
  registerPresenceRoutes(app, { ...deps, presence: deps.presence ?? NOBODY_CONNECTED });
  registerDmRoutes(app, deps);
  registerUndoneRoutes(app, deps);
  if (deps.signIn) {
    const signIn = { ...deps, signIn: deps.signIn };
    registerAuthRoutes(app, signIn);
    registerMemberRoutes(app, signIn);
  }
  return app;
}
