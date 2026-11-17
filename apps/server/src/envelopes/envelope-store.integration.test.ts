import { MAX_ENVELOPES } from '@ltw/contracts';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import { InMemoryEnvelopeStore, type EnvelopeStore, type NewEnvelope } from './envelope-store.ts';
import { PostgresEnvelopeStore } from './postgres-envelope-store.ts';

/**
 * Sealed envelopes on PostgreSQL (migration 0047, Stage 880), held to the in-memory store's
 * semantics: sealed once by its ID, opened once, bounded a campaign, each campaign its own.
 */
let database: ThrowawayDatabase;
let pool: pg.Pool;

beforeEach(async () => {
  database = await createThrowawayDatabase({ migrate: true });
  pool = new pg.Pool({ connectionString: database.url });
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

const C = 'ravenford';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (seconds: number) => new Date(Date.UTC(2026, 10, 16, 18, 0, seconds)).toISOString();
const envelope = (n: number, over: Partial<NewEnvelope> = {}): NewEnvelope => ({
  campaignId: C,
  envelopeId: ID(n),
  label: `Envelope ${String(n)}`,
  title: 'A letter',
  text: 'Meet me at the mill.',
  entityId: null,
  opens: 'word',
  sessionId: null,
  sealedAt: at(n),
  ...over,
});

async function life(store: EnvelopeStore) {
  const seen: unknown[] = [];
  seen.push(await store.seal(envelope(1)));
  // A retried request: the first sealing stands, whatever the second says.
  seen.push(await store.seal(envelope(1, { label: 'Changed', title: 'Other' })));
  seen.push(
    await store.seal(
      envelope(2, {
        opens: 'chapter',
        sessionId: 'ravenford-s1',
        text: null,
        entityId: 'mira-vale',
      }),
    ),
  );
  seen.push(await store.seal(envelope(3, { campaignId: 'other' })));
  seen.push(await store.list(C));
  // Opened once; the second opening changes nothing, nor does opening in another campaign.
  seen.push(await store.open(C, ID(1), 'word', at(10)));
  seen.push(await store.open(C, ID(1), 'chapter', at(20)));
  seen.push(await store.open('other', ID(1), 'word', at(10)));
  seen.push(await store.open(C, ID(9), 'word', at(10)));
  seen.push(await store.list(C));
  seen.push(await store.delete(C, ID(1)));
  seen.push(await store.delete(C, ID(1)));
  seen.push(await store.delete(C, ID(3)));
  seen.push(await store.list(C));
  seen.push(await store.list('other'));
  return seen;
}

describe('the PostgreSQL envelope store', () => {
  it('keeps what the in-memory store keeps', async () => {
    const expected = await life(new InMemoryEnvelopeStore());
    expect(await life(new PostgresEnvelopeStore(pool))).toEqual(expected);
    // And what that is: sealed once, opened once by the first opener.
    const [first, again, , , listed, opened, twice] = expected as [
      string,
      string,
      unknown,
      unknown,
      { label: string; openedAt: string | null }[],
      boolean,
      boolean,
    ];
    expect([first, again, opened, twice]).toEqual(['sealed', 'kept', true, false]);
    expect(listed.map((one) => one.label)).toEqual(['Envelope 1', 'Envelope 2']);
  });

  it('holds as many as a campaign may, and no more', async () => {
    for (const store of [new InMemoryEnvelopeStore(), new PostgresEnvelopeStore(pool)]) {
      for (let n = 1; n <= MAX_ENVELOPES; n += 1) {
        expect(await store.seal(envelope(n, { campaignId: 'full' }))).toBe('sealed');
      }
      expect(await store.seal(envelope(MAX_ENVELOPES + 1, { campaignId: 'full' }))).toBe('full');
      // A retry of one it holds is still that one.
      expect(await store.seal(envelope(1, { campaignId: 'full' }))).toBe('kept');
      expect(await store.delete('full', ID(1))).toBe(true);
      expect(await store.seal(envelope(MAX_ENVELOPES + 1, { campaignId: 'full' }))).toBe('sealed');
    }
  });

  it('refuses a row the contract would not make', async () => {
    const insert = (columns: string, values: string) =>
      pool.query(
        `INSERT INTO ltw_envelopes (campaign_id, envelope_id, label, title, ${columns}, sealed_at)
         VALUES ('ravenford', '${ID(50)}', 'Outside', 'Inside', ${values}, now())`,
      );
    // Nothing inside; a session named for the DM's word; opened without saying by what.
    await expect(insert('opens', `'word'`)).rejects.toThrow();
    await expect(insert('body, opens, session_id', `'x', 'word', 's1'`)).rejects.toThrow();
    await expect(insert('body, opens, opened_at', `'x', 'word', now()`)).rejects.toThrow();
    await expect(insert('body, opens', `'x', 'midnight'`)).rejects.toThrow();
  });
});
