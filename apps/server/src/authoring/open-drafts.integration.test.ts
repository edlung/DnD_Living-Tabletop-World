import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { loadMigrations } from '../platform/db/migration-source.ts';
import { MIGRATIONS_DIR } from '../platform/db/migrations-dir.ts';
import { runMigrations } from '../platform/db/migrator.ts';
import { PostgresProposalStore } from './postgres-proposal-store.ts';
import type { DraftSummary, ProposalRevision } from './proposal-store.ts';

/**
 * The DM's open drafts on PostgreSQL (owner decisions 11, SI-D1; migration 0013): the list reads
 * each proposal's latest revision through its index, leaves out cancelled and committed ones in
 * SQL, pages newest first after a keyset cursor; and the migration closes the drafts that were
 * open before drafts could be restored, once, never a committed one.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase();
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const migrate = async (upTo = Number.POSITIVE_INFINITY) => {
  const client = await pool.connect();
  try {
    await runMigrations({
      client,
      migrations: (await loadMigrations(MIGRATIONS_DIR)).filter((m) => m.version <= upTo),
      logger: createLogger({ service: 'open-drafts-test', level: 'silent' }),
    });
  } finally {
    client.release();
  }
};

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 12, minute)).toISOString();

const revision = (changes: Partial<ProposalRevision> = {}): ProposalRevision => ({
  campaignId: 'ravenford',
  proposalId: id(1),
  revision: 1,
  summary: 'Tomas.',
  source: { kind: 'dm' },
  commands: [],
  createdBy: 'dm-ravenford',
  createdAt: at(0),
  ...changes,
});

/** The commit of a proposal, as the event store records it (`authoring.<proposalId>`). */
async function committed(proposalId: string) {
  await pool.query(
    `INSERT INTO ltw_event_streams (stream_id, version) VALUES ('ravenford', 1)
     ON CONFLICT DO NOTHING`,
  );
  const sequence = Number(
    (await pool.query<{ n: string }>('SELECT count(*) + 1 AS n FROM ltw_commands')).rows[0]?.n,
  );
  await pool.query(
    `INSERT INTO ltw_commands (command_id, stream_id, command_type, actor, fingerprint, command,
       reason, first_sequence, last_sequence, recorded_at)
     VALUES ($1, 'ravenford', 'ApplyAuthoring', '{}', 'f', '{}', NULL, $2, $2, now())`,
    [`authoring.${proposalId}`, sequence],
  );
}

const ids = (drafts: readonly DraftSummary[]) => drafts.map((draft) => draft.proposalId);

describe('the list of drafts', () => {
  it('reads latest revisions only, newest first, in pages, over many revisions', async () => {
    await migrate();
    const store = new PostgresProposalStore(pool);
    // 30 proposals of 6 revisions each; the latest revision's time orders them.
    for (let n = 1; n <= 30; n += 1) {
      for (let r = 1; r <= 6; r += 1) {
        await store.append(
          revision({
            proposalId: id(n),
            revision: r,
            summary: `P${String(n)} r${String(r)}`,
            createdAt: at(n + r * 40),
          }),
        );
      }
    }
    await store.append(
      revision({ proposalId: id(3), revision: 7, cancelled: true, createdAt: at(400) }),
    );
    await committed(id(4));
    await store.append(
      revision({ proposalId: id(99), campaignId: 'elsewhere', createdAt: at(500) }),
    );

    const first = await store.uncancelled('ravenford', { limit: 10, after: null });
    expect(first[0]).toEqual({
      proposalId: id(30),
      revision: 6,
      summary: 'P30 r6',
      source: { kind: 'dm' },
      createdAt: at(270),
    });
    const all: DraftSummary[] = [...first];
    for (let page = first; page.length === 10;) {
      const last = page.at(-1);
      if (!last) break;
      page = await store.uncancelled('ravenford', { limit: 10, after: last });
      all.push(...page);
    }
    const expected = Array.from({ length: 30 }, (_, i) => id(30 - i)).filter(
      (proposal) => proposal !== id(3) && proposal !== id(4),
    );
    expect(ids(all)).toEqual(expected);

    const index = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'ltw_authoring_revisions_latest'`,
    );
    expect(index.rows[0]).toMatchObject({
      indexdef: expect.stringContaining('(campaign_id, proposal_id, revision DESC)') as unknown,
    });
  });
});

describe('migration 0013', () => {
  it('closes every draft open before it, once, and never a committed or cancelled one', async () => {
    await migrate(12);
    const store = new PostgresProposalStore(pool);
    await store.append(revision({ proposalId: id(1) }));
    await store.append(revision({ proposalId: id(1), revision: 2, summary: 'Tomas, edited.' }));
    await store.append(revision({ proposalId: id(2) }));
    await committed(id(2));
    await store.append(revision({ proposalId: id(3) }));
    await store.append(revision({ proposalId: id(3), revision: 2, cancelled: true }));

    await migrate();
    expect(await store.latest('ravenford', id(1))).toMatchObject({
      revision: 3,
      summary: 'Tomas, edited.',
      cancelled: true,
      createdBy: 'migration:0013',
    });
    expect(await store.latest('ravenford', id(2))).toMatchObject({ revision: 1 });
    expect((await store.latest('ravenford', id(2)))?.cancelled).toBeUndefined();
    expect(await store.latest('ravenford', id(3))).toMatchObject({ revision: 2 });
    expect(await store.uncancelled('ravenford', { limit: 20, after: null })).toEqual([]);

    // Its closing statement again changes nothing.
    const migration = (await loadMigrations(MIGRATIONS_DIR)).find((m) => m.version === 13);
    const closing = migration?.sql.slice(migration.sql.indexOf('INSERT INTO')) ?? '';
    expect(closing).not.toBe('');
    const count = async () =>
      Number(
        (await pool.query<{ n: string }>('SELECT count(*) AS n FROM ltw_authoring_revisions'))
          .rows[0]?.n,
      );
    const before = await count();
    await pool.query(closing);
    expect(await count()).toBe(before);
  });
});
