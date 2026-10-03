import { describe, expect, it } from 'vitest';

import {
  AMBUSH,
  ELOWEN,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
} from './testing/road.ts';

/** Encounter lifecycle, initiative and turn order (ADR 0015 §1–2). */
describe('starting combat', () => {
  it('rolls initiative and orders by total, then Dexterity, then ID', async () => {
    const world = await roadWorld();
    // Elowen 10+4; Raider 1 12+2; Raider 2 12+2; Raider 3 1+2; Shaman 12+2.
    expect(codeOf(await startAmbush(world, [10, 12, 12, 1, 12]))).toBe('accepted');
    const encounter = await world.encounter();
    // All tie at 14: Elowen has Dex 18, Raiders Dex 15 (then ID), the Shaman Dex 14.
    expect(encounter.combatants.map((c) => [c.entityId, c.initiative.total])).toEqual([
      [ELOWEN, 14],
      [RAIDER_1, 14],
      [RAIDER_2, 14],
      [SHAMAN, 14],
      [RAIDER_3, 3],
    ]);
    expect(encounter).toMatchObject({ round: 1, currentIndex: 0, locationId: 'old-trade-road' });
  });

  it('is DM-only and refuses a second encounter or an absent combatant', async () => {
    const world = await roadWorld();
    const command = AMBUSH.startCombat;
    expect(codeOf(await world.submit(command))).toBe('FORBIDDEN');
    // Nobody is on the road yet.
    expect(codeOf(await world.dm(command))).toBe('INVALID_ENCOUNTER');
    await startAmbush(world);
    expect(codeOf(await world.dm(command))).toBe('COMBAT_ALREADY_ACTIVE');
  });

  it('refuses a combatant without a stat block', async () => {
    const world = await roadWorld();
    await world.dm({ type: 'PlaceEntity', entityId: 'mira-vale', locationId: 'old-trade-road' });
    const result = await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: [
        ...command.combatants,
        { entityId: 'mira-vale', side: 'neutral', position: { x: 0, y: 0 } },
      ],
    }));
    expect(codeOf(result)).toBe('NO_STAT_BLOCK');
  });

  it('refuses overlapping squares and squares outside the battlefield', async () => {
    const world = await roadWorld();
    const overlap = await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === RAIDER_2 ? { ...c, position: { x: 8, y: 4 } } : c,
      ),
    }));
    expect(codeOf(overlap)).toBe('INVALID_ENCOUNTER');
    const outside = await world.dm({
      ...AMBUSH.startCombat,
      combatants: AMBUSH.startCombat.combatants.map((c) =>
        c.entityId === RAIDER_2 ? { ...c, position: { x: 30, y: 4 } } : c,
      ),
    });
    expect(codeOf(outside)).toBe('INVALID_ENCOUNTER');
  });
});

describe('turns', () => {
  it('lets only the current combatant act, and wraps into the next round', async () => {
    const world = await roadWorld();
    await startAmbush(world); // Elowen, Shaman, Raider 1, Raider 2, Raider 3
    const shamanEnds = { type: 'EndTurn', combatantId: SHAMAN };
    expect(codeOf(await world.dm(shamanEnds))).toBe('NOT_YOUR_TURN');
    expect(codeOf(await world.dm({ type: 'EndTurn', combatantId: ELOWEN }))).toBe('accepted');
    expect(codeOf(await world.dm(shamanEnds))).toBe('accepted');
    for (const id of [RAIDER_1, RAIDER_2]) await world.dm({ type: 'EndTurn', combatantId: id });
    expect((await world.encounter()).round).toBe(1);
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_3 });
    expect(await world.encounter()).toMatchObject({ round: 2, currentIndex: 0 });
  });

  it('gives the player an EndTurn outcome and refuses a player acting for a goblin', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: SHAMAN }))).toBe('FORBIDDEN');
    const ended = await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
    expect(ended.status === 'accepted' && ended.outcome).toEqual({
      kind: 'EndTurn',
      nextCombatantId: SHAMAN,
      round: 1,
    });
  });

  it('skips dead combatants', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' });
    await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
    const encounter = await world.encounter();
    expect(encounter.combatants[encounter.currentIndex]?.entityId).toBe(RAIDER_1);
  });

  it('resets the action economy at the start of a turn', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: RAIDER_2,
    });
    for (const id of [ELOWEN, SHAMAN, RAIDER_1, RAIDER_2, RAIDER_3]) {
      await world.dm({ type: 'EndTurn', combatantId: id });
    }
    const elowen = (await world.encounter()).combatants[0];
    expect(elowen?.turn).toMatchObject({ actionUsed: false, attacksRemaining: 0 });
  });
});

describe('ending combat', () => {
  it('is DM-only, ends Slowed, and clears the encounter', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 19);
    world.roll(8, 1);
    await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: RAIDER_2,
    });
    const { encounterId } = await world.encounter();
    expect(codeOf(await world.submit({ type: 'EndCombat', encounterId }))).toBe('FORBIDDEN');
    expect(codeOf(await world.dm({ type: 'EndCombat', encounterId: 'other' }))).toBe(
      'NOT_IN_COMBAT',
    );
    const ended = await world.dm({ type: 'EndCombat', encounterId });
    expect((await recorded(world, ended)).map((e) => e.type)).toContain('CombatEnded');
    const state = await world.state();
    expect(state.encounter).toBeNull();
    expect(state.statBlocks.get(RAIDER_2)?.conditions).toEqual([]);
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: ELOWEN }))).toBe(
      'NOT_IN_COMBAT',
    );
  });
});
