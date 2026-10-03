import { randomUUID } from 'node:crypto';

import type { WorldEngine } from '@ltw/domain';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { Logger } from '../platform/logging/logger.ts';
import type { Authenticator } from './auth.ts';
import { sendError } from './errors.ts';
import { registerCommandRoutes } from './routes/command-routes.ts';
import { registerContextRoutes } from './routes/context-routes.ts';
import { registerKnowledgeRoutes } from './routes/knowledge-routes.ts';
import { registerMemoryRoutes } from './routes/memory-routes.ts';

/**
 * The server's HTTP application (docs/adr/0009-http-api-and-dev-authentication.md).
 * Request IDs are generated server-side (client `x-request-id` is ignored),
 * responses are never cacheable, and errors never reveal internals.
 */
export interface AppDependencies {
  readonly engine: WorldEngine;
  readonly authenticator: Authenticator;
  readonly logger: Logger;
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
  registerMemoryRoutes(app, deps);
  registerContextRoutes(app, deps);
  registerCommandRoutes(app, deps);
  return app;
}
