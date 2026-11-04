import { randomUUID } from 'node:crypto';

import type { DmHistoryEntry, StatBlockResponse } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { CAMPAIGN, dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get, post } from '../testing/ravenford-app.ts';

/**
 * The DM's editors over HTTP (docs/adr/0058-campaign-content.md §1): a story object given to Elowen
 * and another left at Market Square, two of the DM's commands each listed in the DM's history and
 * undone there; a creature's stat block read for its numbers, the DM's alone.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

async function table(): Promise<DmTable> {
  const created = await dmTable();
  tables.push(created);
  return created;
}

const ELOWEN = 'elowen-starwhisper';

describe('story objects', () => {
  it('are made, given or left, and listed in the DM’s history', async () => {
    const { app, engine, page, command } = await table();
    const make = (body: Record<string, unknown>, token: string = TOKENS.dm) =>
      post(app, `${CAMPAIGN}/story-objects`, { requestId: randomUUID(), ...body }, token);
    expect((await make({ name: 'A letter', holderId: ELOWEN }, TOKENS.player)).statusCode).toBe(
      403,
    );
    expect((await make({ name: 'A letter' })).statusCode).toBe(400);
    const given = await make({
      name: 'A sealed letter',
      description: 'Wax, a raven.',
      holderId: ELOWEN,
    });
    expect(given.statusCode).toBe(200);
    const { itemId } = given.json<{ itemId: string }>();
    const left = await make({ name: 'A broken lute', locationId: 'market-square' });
    expect(left.statusCode).toBe(200);
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.possessions.get(itemId)).toMatchObject({ holderId: ELOWEN, catalogId: null });
    const lute = left.json<{ itemId: string }>().itemId;
    expect(state?.entities.get(lute)?.placement?.locationId).toBe('market-square');
    // Three of the DM's edits, newest first: the lute made, the letter given, the letter made.
    const edits = (await page()).entries.filter(
      (entry): entry is Extract<DmHistoryEntry, { kind: 'edit' }> => entry.kind === 'edit',
    );
    expect(edits.map((entry) => entry.command.type)).toEqual([
      'CreateEntity',
      'GrantItem',
      'CreateEntity',
    ]);
    // The letter's gift is undone from the history, then its making.
    const [, gift, making] = edits;
    for (const entry of [gift, making]) {
      const undone = await command(
        { type: 'UndoCommand', targetCommandId: entry?.commandId },
        TOKENS.dm,
      );
      expect(undone.result.status).toBe('accepted');
    }
    const after = (await engine.load('ravenford'))?.state;
    expect(after?.entities.has(itemId)).toBe(false);
  });
});

describe('a stat block for the DM’s editor', () => {
  it('answers the DM, refuses a player, and finds no block for a place', async () => {
    const { app } = await table();
    const block = (id: string, token: string) =>
      get(app, `${CAMPAIGN}/entities/${id}/stat-block`, token);
    const added = await post(
      app,
      `${CAMPAIGN}/bestiary/goblin-warrior/add`,
      { requestId: randomUUID(), locationId: 'market-square', name: 'Snitch' },
      TOKENS.dm,
    );
    expect(added.statusCode).toBe(200);
    const { entityId } = added.json<{ entityId: string }>();
    const read = await block(entityId, TOKENS.dm);
    expect(read.statusCode).toBe(200);
    expect(read.json<StatBlockResponse>().statBlock.armorClass).toBeGreaterThan(0);
    expect((await block(entityId, TOKENS.player)).statusCode).toBe(403);
    expect((await block('market-square', TOKENS.dm)).statusCode).toBe(404);
  });
});
