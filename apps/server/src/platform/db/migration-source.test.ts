import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MigrationIntegrityError,
  checksumOf,
  compareMigrations,
  loadMigrations,
  parseMigrations,
  planMigrations,
} from './migration-source.ts';

const file = (name: string, sql = 'SELECT 1;') => ({ name, sql });

describe('parseMigrations', () => {
  it('orders migrations by version and computes checksums', () => {
    const migrations = parseMigrations([file('0002_second.sql', 'B'), file('0001_first.sql', 'A')]);

    expect(migrations.map((m) => [m.id, m.version, m.checksum])).toEqual([
      ['0001_first', 1, checksumOf('A')],
      ['0002_second', 2, checksumOf('B')],
    ]);
  });

  it('ignores non-SQL files such as AGENTS.md', () => {
    expect(parseMigrations([file('AGENTS.md', '# notes'), file('.gitkeep', '')])).toEqual([]);
  });

  it.each(['1_short.sql', '0001-dash.sql', '0001_Upper.sql', '0001_.sql', '0001_trailing_.sql'])(
    'rejects malformed name %s',
    (name) => {
      expect(() => parseMigrations([file(name)])).toThrow(MigrationIntegrityError);
    },
  );

  it('rejects duplicate versions', () => {
    expect(() => parseMigrations([file('0001_a.sql'), file('0001_b.sql')])).toThrow(
      /share version 1/,
    );
  });

  it('rejects empty migrations', () => {
    expect(() => parseMigrations([file('0001_a.sql', '  \n')])).toThrow(/is empty/);
  });
});

describe('planMigrations', () => {
  const available = parseMigrations([
    file('0001_a.sql', 'A'),
    file('0002_b.sql', 'B'),
    file('0003_c.sql', 'C'),
  ]);
  const record = (index: number) => {
    const migration = available[index];
    if (!migration) throw new Error('fixture index out of range');
    return { id: migration.id, checksum: migration.checksum };
  };

  it('returns everything for an empty database', () => {
    expect(planMigrations(available, []).map((m) => m.id)).toEqual(['0001_a', '0002_b', '0003_c']);
  });

  it('returns only the unapplied suffix', () => {
    expect(planMigrations(available, [record(0), record(1)]).map((m) => m.id)).toEqual(['0003_c']);
  });

  it('returns nothing when up to date', () => {
    expect(planMigrations(available, [record(0), record(1), record(2)])).toEqual([]);
  });

  it('rejects a modified applied migration', () => {
    expect(() => planMigrations(available, [{ id: '0001_a', checksum: 'other' }])).toThrow(
      /modified after it was applied/,
    );
  });

  it('rejects history that diverges from disk order', () => {
    expect(() => planMigrations(available, [record(1)])).toThrow(/diverges at position 1/);
  });

  it('rejects applied migrations missing on disk', () => {
    expect(() => planMigrations(available.slice(0, 1), [record(0), record(1)])).toThrow(
      /missing on disk: 0002_b/,
    );
  });
});

describe('compareMigrations (rollback to an earlier build, ADR 0037)', () => {
  const available = parseMigrations([file('0001_a.sql', 'A'), file('0002_b.sql', 'B')]);
  const newerBuild = parseMigrations([
    file('0001_a.sql', 'A'),
    file('0002_b.sql', 'B'),
    file('0003_c.sql', 'C'),
    file('0004_d.sql', 'D'),
  ]);
  const history = newerBuild.map(({ id, checksum }) => ({ id, checksum }));

  it('reports the migrations only a newer build applied, and nothing pending', () => {
    expect(compareMigrations(available, history)).toEqual({
      pending: [],
      newer: ['0003_c', '0004_d'],
    });
  });

  it('reports pending files and no newer history for an older database', () => {
    const result = compareMigrations(newerBuild, history.slice(0, 1));
    expect(result.pending.map((migration) => migration.id)).toEqual(['0002_b', '0003_c', '0004_d']);
    expect(result.newer).toEqual([]);
  });

  it('still refuses drift in the history both builds share', () => {
    const edited = history.map((entry, index) =>
      index === 1 ? { ...entry, checksum: 'other' } : entry,
    );
    expect(() => compareMigrations(available, edited)).toThrow(/modified after it was applied/);
    const reordered = [history[1], history[0], ...history.slice(2)].filter(
      (entry) => entry !== undefined,
    );
    expect(() => compareMigrations(available, reordered)).toThrow(/diverges at position 1/);
  });
});

describe('loadMigrations', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('reads .sql files from a directory', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ltw-migrations-'));
    await writeFile(join(directory, '0002_b.sql'), 'B');
    await writeFile(join(directory, '0001_a.sql'), 'A');
    await writeFile(join(directory, 'AGENTS.md'), '# guidance');

    const migrations = await loadMigrations(directory);

    expect(migrations.map((m) => [m.id, m.sql])).toEqual([
      ['0001_a', 'A'],
      ['0002_b', 'B'],
    ]);
  });
});
