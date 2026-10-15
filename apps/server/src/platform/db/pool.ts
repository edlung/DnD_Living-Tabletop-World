import pg from 'pg';

import type { Logger } from '../logging/logger.ts';

/**
 * The server's connection pools (docs/adr/0037-deployment.md). When the database closes an idle
 * connection (a restart, a failover, an administrator), pg-pool emits `error`; without a listener
 * that ends the process. Here the pool drops the connection and connects again on demand, while
 * requests fail and `/readyz` reports the database until it answers. Only the error's code and
 * message are logged: the error carries the client and its connection settings.
 */
export function createPool(
  connectionString: string,
  logger: Logger,
  options: { readonly max?: number } = {},
): pg.Pool {
  const pool = new pg.Pool({ connectionString, ...options });
  pool.on('error', (error: Error & { code?: unknown }) => {
    logger.warn(
      { code: typeof error.code === 'string' ? error.code : null, reason: error.message },
      'database connection lost; the pool reconnects on demand',
    );
  });
  return pool;
}
