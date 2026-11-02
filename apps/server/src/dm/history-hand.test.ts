import type { DmHistoryEntry } from '@ltw/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS } from '../testing/ravenford-app.ts';

/**
 * The DM's hand in the DM history (docs/adr/0043-dm-screen.md §1): damage, a condition, Heroic
 * Inspiration and a ruling from the table, each with the DM's reason and the kernel's undo; a
 * player cannot issue them.
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

describe('the DM’s hand in the history', () => {
  it('lists damage, a condition, inspiration and a ruling with their reasons', async () => {
    const { command, page } = await table();
    const fall = {
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 6,
      damageType: 'bludgeoning',
      reason: 'The ladder broke',
    };
    expect((await command(fall, TOKENS.dm, 'fall')).status).toBe(200);
    const prone = {
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'prone',
      applied: true,
      reason: 'Landed badly',
    };
    expect((await command(prone, TOKENS.dm, 'prone')).status).toBe(200);
    const inspired = {
      type: 'SetInspiration',
      characterId: ELOWEN,
      inspired: true,
      reason: 'Kept her nerve',
    };
    expect((await command(inspired, TOKENS.dm, 'inspired')).status).toBe(200);
    const ruling = {
      type: 'RecordMemory',
      scope: { kind: 'PARTY' },
      memoryKind: 'CONSEQUENCE',
      summary: 'Elowen climbed the rest of the way by the rope.',
      occurredAt: 36_000,
      participants: [ELOWEN],
      reason: 'An Athletics roll of 17 on her own dice',
    };
    expect((await command(ruling, TOKENS.dm, 'ruling')).status).toBe(200);

    const entries = (await page()).entries as DmHistoryEntry[];
    expect(entries.map((entry) => entry.kind)).toEqual(['hand', 'hand', 'hand', 'hand']);
    const [written, inspiration, condition, damage] = entries;
    expect(damage).toMatchObject({
      commandId: 'http:dm-ravenford:fall',
      change: {
        kind: 'hit-points',
        target: { entityId: ELOWEN, name: 'Elowen Starwhisper' },
        change: 'damage',
        amount: 6,
        damageType: 'bludgeoning',
      },
      reason: 'The ladder broke',
      status: 'COMMITTED',
    });
    expect(damage?.kind === 'hand' && damage.change.kind === 'hit-points').toBe(true);
    // The inspiration read the same sheet afterwards: undoing the condition waits for it.
    expect(condition).toMatchObject({
      change: { kind: 'condition', condition: 'prone', applied: true },
      reason: 'Landed badly',
      undo: {
        possible: false,
        code: 'UNDO_UNSAFE',
        blockers: [{ commandId: 'http:dm-ravenford:inspired', commandType: 'SetInspiration' }],
      },
    });
    expect(written?.undo).toEqual({ possible: true });
    expect(inspiration).toMatchObject({
      change: { kind: 'inspiration', inspired: true },
      reason: 'Kept her nerve',
    });
    expect(written).toMatchObject({
      change: { kind: 'ruling', summary: ruling.summary, characters: [{ entityId: ELOWEN }] },
      reason: ruling.reason,
    });
  });

  it('lists the DM’s changes of a running fight, undone as the kernel allows', async () => {
    const { command, page, startAmbush } = await table();
    await startAmbush();
    const raider = 'creature-6513bec0';
    const raised = { type: 'SetInitiative', combatantId: raider, total: 19 };
    expect((await command(raised, TOKENS.dm, 'raised')).status).toBe(200);
    const fled = { type: 'RemoveCombatant', entityId: raider, reason: 'Fled into the trees' };
    expect((await command(fled, TOKENS.dm, 'fled')).status).toBe(200);
    const [left, initiative] = (await page()).entries as DmHistoryEntry[];
    expect(left).toMatchObject({
      kind: 'hand',
      change: { kind: 'fight', change: 'left', combatant: { entityId: raider }, total: null },
      reason: 'Fled into the trees',
      undo: { possible: true },
    });
    expect(initiative).toMatchObject({
      change: { kind: 'fight', change: 'initiative', total: 19 },
      reason: null,
    });
  });

  it('refuses the hand to a player', async () => {
    const { command } = await table();
    const heal = {
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'healing',
      amount: 5,
      reason: 'I would like that',
    };
    expect((await command(heal, TOKENS.player, 'heal')).status).toBe(403);
  });
});
