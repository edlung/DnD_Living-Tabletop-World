import type { CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  SHAMAN,
  codeOf,
  openWindowId,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';
import { verifyHistory } from '../testing/verify.ts';

/**
 * An attack's windows (docs/adr/0046-reactions-beyond-counterspell.md §3–4), through the World
 * Engine: Heroic Inspiration's reroll of a miss, Shield and Uncanny Dodge against a hit, Hellish
 * Rebuke after its damage, and a window that waits inside an opportunity attack's. Elowen (AC 17,
 * 78 HP) acts first, then the Shaman and the Raiders (scimitar +4, 1d6 + 2).
 */
const beside = (command: { combatants: { entityId: string }[] } & Record<string, unknown>) => ({
  ...command,
  combatants: command.combatants.map((c) =>
    c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 6 } } : c,
  ),
});
const sheetOf = async (world: RoadWorld) => {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  return sheet;
};
/** Elowen as the test needs her: her ranger spells and more, or another class. */
async function reshape(world: RoadWorld, change: (sheet: CharacterSheet) => CharacterSheet) {
  const sheet = change(await sheetOf(world));
  expect(codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet }))).toBe(
    'accepted',
  );
}
const withSpells =
  (...spells: CharacterSheet['spellcasting'][number]['spells']) =>
  (sheet: CharacterSheet): CharacterSheet => ({
    ...sheet,
    spellcasting: sheet.spellcasting.map((source, index) =>
      index === 0 ? { ...source, spells: [...source.spells, ...spells] } : source,
    ),
  });
/** On to Raider 1's turn: Elowen and the Shaman end theirs. */
async function toRaider(world: RoadWorld) {
  await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
  await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
}
const slash = (raider = RAIDER_1) => ({
  type: 'Attack',
  combatantId: raider,
  attackId: 'scimitar',
  targetId: ELOWEN,
});
const hp = async (world: RoadWorld, id = ELOWEN) =>
  (await world.state()).characterSheets.get(id)?.hitPoints.current ??
  (await world.state()).statBlocks.get(id)?.hitPoints.current;

describe('Heroic Inspiration', () => {
  it('rolls a missed attack again: the new roll counts, and it is spent', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({
      type: 'SetInspiration',
      characterId: ELOWEN,
      inspired: true,
      reason: 'A fine plan',
    });
    world.roll(20, 2);
    const shot = await world.submit(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(shot.status === 'accepted' && shot.outcome).toMatchObject({ awaitingReaction: true });
    const windowId = await openWindowId(world);
    expect((await world.state()).reactionWindows.get(windowId)?.candidates).toEqual([
      { entityId: ELOWEN, response: 'pending', reactions: ['inspiration-reroll'] },
    ]);
    world.roll(20, 18);
    world.roll(8, 5);
    const again = await world.submit(
      { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'inspiration-reroll' },
      PLAYER,
    );
    expect(codeOf(again)).toBe('accepted');
    const performed = (await recorded(world, again)).find((e) => e.type === 'AttackPerformed');
    expect(performed?.type === 'AttackPerformed' && performed.payload).toMatchObject({
      rerolled: true,
      hit: true,
    });
    expect(await hp(world, RAIDER_1)).toBeLessThan(10);
    expect((await sheetOf(world)).heroicInspiration).toBeUndefined();
    await verifyHistory(world);
  });

  it('kept, the miss stands and the inspiration stays', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({
      type: 'SetInspiration',
      characterId: ELOWEN,
      inspired: true,
      reason: 'A fine plan',
    });
    world.roll(20, 2);
    await world.submit(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: RAIDER_1 },
      PLAYER,
    );
    const windowId = await openWindowId(world);
    await world.submit({ type: 'DeclineReaction', combatantId: ELOWEN, windowId }, PLAYER);
    expect(await hp(world, RAIDER_1)).toBe(10);
    expect((await sheetOf(world)).heroicInspiration).toBe(true);
  });
});

describe('Shield', () => {
  it('turns a hit it can into a miss and keeps her AC 5 higher until her next turn', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await reshape(world, withSpells('shield'));
    await toRaider(world);
    world.roll(20, 15);
    world.roll(6, 4);
    expect(codeOf(await world.dm(slash()))).toBe('accepted');
    const windowId = await openWindowId(world);
    const window = (await world.state()).reactionWindows.get(windowId);
    expect(window?.trigger).toMatchObject({ kind: 'attack', phase: 'hit', total: 19 });
    expect(window?.candidates[0]?.reactions).toEqual(['shield']);
    const shielded = await world.submit(
      { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'shield' },
      PLAYER,
    );
    expect(codeOf(shielded)).toBe('accepted');
    expect(await hp(world)).toBe(78);
    expect((await sheetOf(world)).spellSlots.expended[0]).toBe(1);
    // Raider 2's 19 meets AC 22 now: a miss, with nothing to answer.
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    world.roll(20, 15);
    await world.dm({ ...slash(RAIDER_2), attackId: 'shortbow' });
    expect((await world.state()).reactionWindows.size).toBe(1);
    expect(await hp(world)).toBe(78);
    await verifyHistory(world);
  });

  it('is not offered against a natural 20', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await reshape(world, withSpells('shield'));
    await toRaider(world);
    world.roll(20, 20);
    world.roll(6, 4, 4);
    await world.dm(slash());
    expect((await world.state()).reactionWindows.size).toBe(0);
    expect(await hp(world)).toBe(78 - 10);
  });
});

describe('Uncanny Dodge and Hellish Rebuke', () => {
  it('a rogue halves the hit she sees coming', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await reshape(world, (sheet) => ({ ...sheet, classes: [{ classId: 'rogue', level: 5 }] }));
    await toRaider(world);
    world.roll(20, 15);
    world.roll(6, 5);
    await world.dm(slash());
    const windowId = await openWindowId(world);
    const dodged = await world.submit(
      { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'uncanny-dodge' },
      PLAYER,
    );
    expect(dodged.status === 'accepted' && dodged.outcome).toMatchObject({ damage: 3 });
    expect(await hp(world)).toBe(78 - 3);
  });

  it('the damage done, she rebukes the raider with fire', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await reshape(world, withSpells('hellish-rebuke'));
    await toRaider(world);
    world.roll(20, 15);
    world.roll(6, 4);
    await world.dm(slash());
    expect(await hp(world)).toBe(78 - 6);
    const windowId = await openWindowId(world);
    expect((await world.state()).reactionWindows.get(windowId)?.trigger).toMatchObject({
      kind: 'damage',
      sourceId: RAIDER_1,
      damaged: [{ entityId: ELOWEN, amount: 6 }],
    });
    world.roll(10, 6, 5);
    world.roll(20, 2);
    const burned = await world.submit(
      { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'hellish-rebuke' },
      PLAYER,
    );
    expect(burned.status === 'accepted' && burned.outcome).toMatchObject({ damage: 11 });
    expect((await world.state()).entities.get(RAIDER_1)?.status).toBe('dead');
    await verifyHistory(world);
  });
});

describe('a window inside a window', () => {
  it('an opportunity attack’s hit waits for her Shield, then her move goes on', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, beside);
    await reshape(world, withSpells('shield'));
    await world.submit(
      {
        type: 'MoveCombatant',
        combatantId: ELOWEN,
        path: [
          { x: 1, y: 6 },
          { x: 0, y: 6 },
        ],
      },
      PLAYER,
    );
    const moveWindow = await openWindowId(world);
    world.roll(20, 15);
    world.roll(6, 4);
    expect(
      codeOf(
        await world.dm({
          type: 'UseReaction',
          combatantId: RAIDER_1,
          windowId: moveWindow,
          reaction: 'opportunity-attack',
          attackId: 'scimitar',
        }),
      ),
    ).toBe('accepted');
    const hitWindow = await openWindowId(world);
    let state = await world.state();
    expect(hitWindow).not.toBe(moveWindow);
    expect(state.reactionWindows.get(moveWindow)?.status).toBe('waiting');
    expect(state.reactionWindows.get(hitWindow)?.parentWindowId).toBe(moveWindow);
    expect(state.encounter?.combatants.find((c) => c.entityId === ELOWEN)?.position).toEqual({
      x: 2,
      y: 6,
    });
    expect(
      codeOf(
        await world.submit(
          { type: 'UseReaction', combatantId: ELOWEN, windowId: hitWindow, reaction: 'shield' },
          PLAYER,
        ),
      ),
    ).toBe('accepted');
    state = await world.state();
    expect(state.reactionWindows.get(moveWindow)?.status).toBe('proceeded');
    expect(state.encounter?.combatants.find((c) => c.entityId === ELOWEN)?.position).toEqual({
      x: 0,
      y: 6,
    });
    expect(await hp(world)).toBe(78);
    await verifyHistory(world);
    expect(DM.kind).toBe('user');
  });
});
