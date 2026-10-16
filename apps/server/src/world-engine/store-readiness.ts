import type pg from 'pg';

import type { Migration } from '../platform/db/migration-source.ts';
import { assertMigrationsCurrent } from '../platform/db/migrator.ts';
import { readinessProbe, type ReadinessProbe } from '../platform/health/readiness.ts';
import type { Logger } from '../platform/logging/logger.ts';
import { PostgresEventStore } from './postgres-event-store.ts';

/**
 * The production `/readyz` probe (docs/adr/0037-deployment.md §3): the database answers, every
 * migration this build carries is applied (a database a newer build migrated passes: the
 * deployment's rollback step accepted it), and this build can read the event store.
 */
export function storeReadiness(
  pool: pg.Pool,
  migrations: readonly Migration[],
  logger: Logger,
  options: { readonly timeoutMs?: number } = {},
): ReadinessProbe {
  const store = new PostgresEventStore(pool);
  return readinessProbe(
    {
      database: async () => {
        await pool.query('SELECT 1');
      },
      migrations: () => assertMigrationsCurrent(pool, migrations),
      eventStore: () => store.assertReadable(),
    },
    { logger: logger.child({ module: 'readiness' }), ...options },
  );
}
