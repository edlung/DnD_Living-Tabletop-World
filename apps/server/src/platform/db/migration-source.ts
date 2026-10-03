import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Forward-only SQL migrations (docs/adr/0003-persistence-and-migrations.md).
 *
 * File name: `NNNN_snake_case_name.sql`. The four-digit version orders
 * migrations; the full file stem is the migration ID. Applied migrations are
 * immutable: their checksum must never change.
 */
export interface Migration {
  readonly id: string;
  readonly version: number;
  readonly sql: string;
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly id: string;
  readonly checksum: string;
}

export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationIntegrityError';
  }
}

const MIGRATION_FILE = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export function parseMigrations(
  files: readonly { readonly name: string; readonly sql: string }[],
): Migration[] {
  const migrations: Migration[] = [];
  const versions = new Map<number, string>();

  for (const file of files) {
    if (!file.name.endsWith('.sql')) {
      continue;
    }
    const match = MIGRATION_FILE.exec(file.name);
    if (!match?.[1]) {
      throw new MigrationIntegrityError(
        `Invalid migration file name "${file.name}"; expected NNNN_snake_case_name.sql`,
      );
    }
    const version = Number(match[1]);
    const id = file.name.slice(0, -'.sql'.length);
    const clash = versions.get(version);
    if (clash !== undefined) {
      throw new MigrationIntegrityError(
        `Migrations "${clash}" and "${id}" share version ${version}`,
      );
    }
    if (file.sql.trim() === '') {
      throw new MigrationIntegrityError(`Migration "${id}" is empty`);
    }
    versions.set(version, id);
    migrations.push({ id, version, sql: file.sql, checksum: checksumOf(file.sql) });
  }

  return migrations.sort((a, b) => a.version - b.version);
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).sort();
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith('.sql'))
      .map(async (name) => ({ name, sql: await readFile(join(directory, name), 'utf8') })),
  );
  return parseMigrations(files);
}

/**
 * Returns the migrations still to apply, or throws if recorded history and
 * the files on disk disagree. History must be an exact prefix of the files:
 * no edited, deleted, or out-of-order migrations.
 */
export function planMigrations(
  available: readonly Migration[],
  applied: readonly AppliedMigration[],
): Migration[] {
  if (applied.length > available.length) {
    const missing = applied.slice(available.length).map((migration) => migration.id);
    throw new MigrationIntegrityError(`Applied migrations missing on disk: ${missing.join(', ')}`);
  }

  applied.forEach((record, index) => {
    const expected = available[index];
    if (expected?.id !== record.id) {
      throw new MigrationIntegrityError(
        `Migration history diverges at position ${index + 1}: database has "${record.id}", disk has "${expected?.id ?? '(none)'}"`,
      );
    }
    if (expected.checksum !== record.checksum) {
      throw new MigrationIntegrityError(
        `Applied migration "${record.id}" was modified after it was applied`,
      );
    }
  });

  return available.slice(applied.length);
}
