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
 *
 * `readEveryEvent` is the rollback step's (`LTW_ALLOW_NEWER_SCHEMA=true`): a newer build may have
 * written events this one cannot parse anywhere in a stream, so the store is not ready until every
 * stored event parsed once. Otherwise the history check stays cheap (one event of every type and
 * schema version, and every stream's newest event).
 */
export function storeReadiness(
  pool: pg.Pool,
  migrations: readonly Migration[],
  logger: Logger,
  options: { readonly timeoutMs?: number; readonly readEveryEvent?: boolean } = {},
): ReadinessProbe {
  const store = new PostgresEventStore(pool);
  const everyEvent = options.readEveryEvent === true;
  return readinessProbe(
    {
      database: async () => {
        await pool.query('SELECT 1');
      },
      migrations: () => assertMigrationsCurrent(pool, migrations),
      eventStore: () => store.assertReadable({ everyEvent }),
    },
    {
      logger: logger.child({ module: 'readiness' }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );
}
