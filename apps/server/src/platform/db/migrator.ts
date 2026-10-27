import type { Logger } from '../logging/logger.ts';
import {
  MigrationIntegrityError,
  compareMigrations,
  newerDatabaseMessage,
  type AppliedMigration,
  type Migration,
} from './migration-source.ts';

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
  /** Present only when a newer build had migrated the database and that was allowed. */
  readonly newer?: readonly string[];
}

/**
 * Applies pending migrations in order. Each migration runs in its own
 * transaction together with its history record, so a failing migration
 * leaves neither partial schema changes nor a history entry.
 *
 * A database a newer build migrated (history extends beyond these files, every common entry
 * identical) is refused unless `allowNewerDatabase` is set: the deployment's explicit rollback
 * step (docs/adr/0037-deployment.md, part A), which then applies nothing.
 */
export async function runMigrations(options: {
  readonly client: SqlClient;
  readonly migrations: readonly Migration[];
  readonly logger: Logger;
  readonly allowNewerDatabase?: boolean;
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
    const applied = await readAppliedMigrations(client);
    const { pending, newer } = compareMigrations(migrations, applied);
    if (newer.length > 0) {
      if (options.allowNewerDatabase !== true) {
        throw new MigrationIntegrityError(newerDatabaseMessage(newer));
      }
      logger.warn({ newer }, 'database was migrated by a newer build; applying nothing (rollback)');
      return { applied: [], alreadyApplied: applied.length, newer };
    }

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

/**
 * Readiness (docs/adr/0037-deployment.md §3): every migration this build carries is applied and
 * the history both share is unchanged. A database a newer build migrated passes: the deployment's
 * rollback step accepted it before the server started.
 */
export async function assertMigrationsCurrent(
  client: SqlClient,
  migrations: readonly Migration[],
): Promise<void> {
  const { pending } = compareMigrations(migrations, await readAppliedMigrations(client));
  if (pending.length > 0) {
    throw new MigrationIntegrityError(
      `Pending migrations: ${pending.map((migration) => migration.id).join(', ')}`,
    );
  }
}

/** The recorded migration history, in order; fails if the history table does not exist. */
export async function readAppliedMigrations(client: SqlClient): Promise<AppliedMigration[]> {
  const { rows } = await client.query(`SELECT id, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return rows.map(toAppliedMigration);
}

function toAppliedMigration(row: Record<string, unknown>): AppliedMigration {
  const { id, checksum } = row;
  if (typeof id !== 'string' || typeof checksum !== 'string') {
    throw new Error(`Malformed row in ${MIGRATIONS_TABLE}`);
  }
  return { id, checksum };
}
