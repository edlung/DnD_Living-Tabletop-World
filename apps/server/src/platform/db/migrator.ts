import type { Logger } from '../logging/logger.ts';
import { planMigrations, type AppliedMigration, type Migration } from './migration-source.ts';

/** The subset of a `pg` client the migrator needs; one dedicated connection. */
export interface SqlClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export const MIGRATIONS_TABLE = 'ltw_schema_migrations';

/** Arbitrary constant key; serializes concurrent migrators on one database. */
const MIGRATION_LOCK_KEY = '7310041975';

export interface MigrationRunResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: number;
}

/**
 * Applies pending migrations in order. Each migration runs in its own
 * transaction together with its history record, so a failing migration
 * leaves neither partial schema changes nor a history entry.
 */
export async function runMigrations(options: {
  readonly client: SqlClient;
  readonly migrations: readonly Migration[];
  readonly logger: Logger;
}): Promise<MigrationRunResult> {
  const { client, migrations, logger } = options;

  await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_KEY]);
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
         id text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query(`SELECT id, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`);
    const applied = rows.map(toAppliedMigration);
    const pending = planMigrations(migrations, applied);

    for (const migration of pending) {
      logger.info({ migration: migration.id }, 'applying migration');
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id, checksum) VALUES ($1, $2)`, [
          migration.id,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration "${migration.id}" failed and was rolled back`, {
          cause: error,
        });
      }
    }

    const result = { applied: pending.map((m) => m.id), alreadyApplied: applied.length };
    logger.info(result, 'migrations complete');
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]);
  }
}

function toAppliedMigration(row: Record<string, unknown>): AppliedMigration {
  const { id, checksum } = row;
  if (typeof id !== 'string' || typeof checksum !== 'string') {
    throw new Error(`Malformed row in ${MIGRATIONS_TABLE}`);
  }
  return { id, checksum };
}
