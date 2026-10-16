import type { FastifyInstance } from 'fastify';

import type { ReadinessProbe } from '../../platform/health/readiness.ts';

/**
 * `GET /readyz` beside `/healthz` (docs/adr/0037-deployment.md §3): 200 `{status: 'ready'}`, or
 * 503 `{status: 'not_ready', failed: [...]}` naming only the failed checks (`database`,
 * `migrations`, `eventStore`). Unauthenticated like `/healthz`; never error text. The proxy
 * serves it as `/api/readyz`; the deployment's health checks call it inside the container every
 * few seconds, so its requests log only warnings and errors (the probe logs changes itself).
 */
export function registerReadinessRoute(app: FastifyInstance, probe: ReadinessProbe): void {
  app.get('/readyz', { logLevel: 'warn' }, async (_request, reply) => {
    const readiness = await probe();
    return readiness.ready
      ? reply.code(200).send({ status: 'ready' })
      : reply.code(503).send({ status: 'not_ready', failed: readiness.failed });
  });
}
