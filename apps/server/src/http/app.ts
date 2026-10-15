import { randomUUID } from 'node:crypto';

import type { RelevanceDeps } from '@ltw/ai';
import type { QuestDefinition } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { AssetContentStore } from '../assets/content-store.ts';
import type { AuthoringDependencies } from '../authoring/service.ts';
import { registerDmRoutes, type DmDependencies } from '../dm/dm-routes.ts';
import { registerPresenceRoutes } from '../live/presence.ts';
import { NOBODY_CONNECTED, type PresenceSource } from '../live/registry.ts';
import type { Logger } from '../platform/logging/logger.ts';
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
import { registerSessionRoutes } from './routes/session-routes.ts';
import { registerSurroundingsRoutes } from './routes/surroundings-routes.ts';
import { registerVisualRoutes } from './routes/visual-routes.ts';

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
}

export function buildApp(deps: AppDependencies): FastifyInstance {
  // Typed as Fastify's base logger so routes share one instance type.
  const loggerInstance: FastifyBaseLogger = deps.logger;
  const app = Fastify({
    loggerInstance,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    bodyLimit: 64 * 1024,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
    reply.header('vary', 'Authorization');
    reply.header('x-content-type-options', 'nosniff');
  });

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

  app.get('/healthz', (_request, reply) => reply.send({ status: 'ok' }));
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
  return app;
}
