import { randomUUID } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';

import type { Logger } from '../platform/logging/logger.ts';

/**
 * Minimal HTTP surface for Stage 0: a liveness probe only.
 *
 * The application API framework is deliberately not chosen yet
 * (docs/adr/0005-server-runtime-foundations.md). Every request gets a
 * server-generated request ID, returned in `x-request-id` and bound to
 * the request's log entries.
 */
export function createHealthServer(options: { readonly logger: Logger }): Server {
  const { logger } = options;

  return createServer((request, response) => {
    const requestId = randomUUID();
    const log = logger.child({ requestId });
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      log.debug(
        { method: request.method, path: request.url, status: response.statusCode },
        'request completed',
      );
    });

    if (request.method === 'GET' && request.url === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}
