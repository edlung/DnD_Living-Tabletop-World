import { createHash, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCredentialStore } from '../auth/postgres-credential-store.ts';
import { createThrowawayDatabase, type ThrowawayDatabase } from '../testing/throwaway-database.ts';
import type { NewDisplay } from './display-store.ts';
import { PostgresDisplayStore } from './postgres-display-store.ts';

/**
 * The table's displays, casts and join links on PostgreSQL (migration 0028, Stage 610): a code
 * pairs once and within the campaign's limit even when two DMs type at once, a display changes one
 * way only, only a display that never paired is pruned, a cast's revision grows, and a table link
 * seats through real invitations.
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

const NOW = '2026-11-02T10:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const waiting = (code: string, created = NOW): NewDisplay => ({
  displayId: randomUUID(),
  tokenHash: hash(`token:${code}`),
  codeHash: hash(code),
  codeExpiresAt: new Date(Date.parse(created) + 10 * 60_000).toISOString(),
  createdAt: created,
  expiresAt: new Date(Date.parse(created) + 30 * 24 * 60 * 60_000).toISOString(),
});

describe('PostgresDisplayStore', () => {
  it('pairs a live code once, within the limit, and lists the campaign’s displays', async () => {
    const store = new PostgresDisplayStore(pool);
    await store.createDisplay(waiting('AAAA2222'));
    await store.createDisplay(waiting('BBBB3333'));
    await store.createDisplay(waiting('CCCC4444'));

    const first = await store.pairDisplay(hash('AAAA2222'), 'ravenford', 'TV', 'dm', at(1), 2);
    if (first === null || first === 'full') throw new Error('the first code pairs');
    expect(first).toMatchObject({ campaignId: 'ravenford', name: 'TV', codeHash: null });
    expect(await store.pairDisplay(hash('AAAA2222'), 'ravenford', 'TV', 'dm', at(1), 2)).toBeNull();
    // An expired code pairs nothing.
    expect(
      await store.pairDisplay(hash('BBBB3333'), 'ravenford', 'TV', 'dm', at(11), 2),
    ).toBeNull();
    expect(await store.pairDisplay(hash('CCCC4444'), 'ravenford', 'TV 2', 'dm', at(2), 2)).not.toBe(
      'full',
    );
    await store.createDisplay(waiting('DDDD5555', at(3)));
    expect(await store.pairDisplay(hash('DDDD5555'), 'ravenford', 'TV 3', 'dm', at(4), 2)).toBe(
      'full',
    );
    expect((await store.campaignDisplays('ravenford', at(5))).map((one) => one.name)).toEqual([
      'TV',
      'TV 2',
    ]);
    expect(await store.renameDisplay('ravenford', first.displayId, 'Hall')).toBe(true);
    expect(await store.renameDisplay('elsewhere', first.displayId, 'X')).toBe(false);
  });

  it('lets only one of two DMs typing at once pass the campaign’s limit', async () => {
    const store = new PostgresDisplayStore(pool);
    await store.createDisplay(waiting('EEEE6666'));
    await store.createDisplay(waiting('FFFF7777'));
    const results = await Promise.all([
      store.pairDisplay(hash('EEEE6666'), 'ravenford', 'TV', 'dm', at(1), 1),
      store.pairDisplay(hash('FFFF7777'), 'ravenford', 'TV', 'dm', at(1), 1),
    ]);
    expect(results.filter((result) => result === 'full')).toHaveLength(1);
    expect(await store.campaignDisplays('ravenford', at(2))).toHaveLength(1);
  });

  it('changes a display one way only and prunes only the ones that never paired', async () => {
    const store = new PostgresDisplayStore(pool);
    const paired = waiting('GGGG8888');
    const never = waiting('HHHH9999');
    await store.createDisplay(paired);
    await store.createDisplay(never);
    await store.pairDisplay(hash('GGGG8888'), 'ravenford', 'TV', 'dm', at(1), 4);

    await expect(
      pool.query('UPDATE ltw_displays SET token_hash = $1 WHERE display_id = $2', [
        hash('other'),
        paired.displayId,
      ]),
    ).rejects.toThrow(/one way/);
    await expect(
      pool.query(`UPDATE ltw_displays SET campaign_id = 'elsewhere' WHERE display_id = $1`, [
        paired.displayId,
      ]),
    ).rejects.toThrow(/one way/);
    expect(await store.revokeDisplays('ravenford', paired.displayId, at(2))).toBe(1);
    await expect(
      pool.query('UPDATE ltw_displays SET revoked_at = NULL WHERE display_id = $1', [
        paired.displayId,
      ]),
    ).rejects.toThrow(/one way/);
    await expect(
      pool.query('DELETE FROM ltw_displays WHERE display_id = $1', [paired.displayId]),
    ).rejects.toThrow(/never deleted/);

    // A cutoff before the unpaired code's expiry keeps it; after, it goes and the paired one stays.
    expect(await store.pruneWaiting(at(5))).toBe(0);
    expect(await store.pruneWaiting(at(60))).toBe(1);
    expect(await store.findDisplay(never.tokenHash)).toBeNull();
    expect((await store.findDisplay(paired.tokenHash))?.revokedAt).toBe(at(2));
  });

  it('notes a display seen at most once a minute', async () => {
    const store = new PostgresDisplayStore(pool);
    const display = waiting('JJJJ2345');
    await store.createDisplay(display);
    await store.displaySeen(display.displayId, at(1));
    await store.displaySeen(display.displayId, new Date(Date.parse(at(1)) + 30_000).toISOString());
    expect((await store.findDisplay(display.tokenHash))?.lastSeenAt).toBe(at(1));
    await store.displaySeen(display.displayId, at(2));
    expect((await store.findDisplay(display.tokenHash))?.lastSeenAt).toBe(at(2));
  });

  it('keeps one cast per campaign whose revision grows', async () => {
    const store = new PostgresDisplayStore(pool);
    expect(await store.readCast('ravenford')).toBeNull();
    expect(await store.writeCast('ravenford', { kind: 'dice' }, at(1))).toBe(1);
    expect(await store.writeCast('ravenford', { kind: 'title', title: 'Ravenford' }, at(2))).toBe(
      2,
    );
    expect(await store.readCast('ravenford')).toEqual({
      cast: { kind: 'title', title: 'Ravenford' },
      revision: 2,
      updatedAt: at(2),
    });
  });

  it('opens, finds, closes and seats a table link through real invitations', async () => {
    const store = new PostgresDisplayStore(pool);
    const credentials = new PostgresCredentialStore(pool);
    const link = {
      linkId: randomUUID(),
      campaignId: 'ravenford',
      tokenHash: hash('table-token'),
      codeHash: hash('KKKK2345'),
      createdBy: 'dm-ravenford',
      createdAt: NOW,
      expiresAt: at(4 * 60),
    };
    await store.createTableLink(link);
    expect((await store.findTableLink({ tokenHash: link.tokenHash }))?.linkId).toBe(link.linkId);
    expect((await store.findTableLink({ codeHash: link.codeHash }))?.linkId).toBe(link.linkId);
    expect((await store.openTableLink('ravenford', at(1)))?.linkId).toBe(link.linkId);
    expect(await store.openTableLink('ravenford', at(5 * 60))).toBeNull();

    const invitationId = randomUUID();
    await credentials.createInvitation({
      invitationId,
      tokenHash: hash('seat-token'),
      campaignId: 'ravenford',
      purpose: 'player',
      characterId: 'char-elowen',
      createdBy: `table:${link.linkId}`,
      createdAt: at(1),
      expiresAt: at(61),
      actorId: null,
    });
    await store.addTableSeat({
      linkId: link.linkId,
      invitationId,
      characterId: 'char-elowen',
      seatedAt: at(1),
    });
    // An invitation seats once.
    await expect(
      store.addTableSeat({ linkId: link.linkId, invitationId, characterId: 'x', seatedAt: at(2) }),
    ).rejects.toThrow();
    expect(await store.tableSeats(link.linkId)).toEqual([
      { linkId: link.linkId, invitationId, characterId: 'char-elowen', seatedAt: at(1) },
    ]);
    expect(await store.closeTableLinks('ravenford', at(2))).toBe(1);
    expect(await store.openTableLink('ravenford', at(3))).toBeNull();
  });
});
