import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  SEREN,
  SEREN_PLAYER,
  addSeren,
  cast,
  closeWindow,
  counterspell,
  ignore,
  shamanCastsAtElowen,
  withSeren,
} from './testing/reactions.ts';
import {
  ELOWEN,
  RAIDER_2,
  SHAMAN,
  codeOf,
  openWindowId,
  roadWorld,
  startAmbush,
  type AMBUSH,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Gate 03 regressions (reviews/ASTRA_GATE_03_REPORT.md). Each finding's
 * reproduction must now end safely, and every accepted history must still
 * replay and re-decide identically.
 */
const undo = (world: RoadWorld, result: CommandResult) =>
  world.dm({ type: 'UndoCommand', targetCommandId: result.commandId ?? '' });
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected' && result.code === 'UNDO_UNSAFE'
    ? (result.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId)
    : [];
async function expectUnsafe(world: RoadWorld, target: CommandResult, blocker: CommandResult) {
  const version = (await world.state()).version;
  const refused = await undo(world, target);
  expect(codeOf(refused)).toBe('UNDO_UNSAFE');
  expect(blockersOf(refused)).toContain(blocker.commandId);
  expect((await world.state()).version).toBe(version);
}
const twoCasters = async () => {
  const world = await roadWorld();
  await addSeren(world);
  await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
  return world;
};

describe('G03-H01 undo_closing_response_rejects_intervening_combatant_mutation', () => {
  it('a countered window, then the caster dies: reopening is unsafe until the death is undone', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 1);
    const answer = await world.submit(counterspell(ELOWEN, windowId));
    const death = await world.dm({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' });
    expect(codeOf(death)).toBe('accepted');
    await expectUnsafe(world, answer, death);
    await verifyHistory(world);
    // Explicit reverse-order recovery reopens a window whose spell can still resolve.
    expect(codeOf(await undo(world, death))).toBe('accepted');
    expect(codeOf(await undo(world, answer))).toBe('accepted');
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('accepted');
    await verifyHistory(world);
  });

  it('a window that let the spell through, then a sheet edit: reopening is unsafe', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    const declined = await world.submit(ignore(ELOWEN, windowId));
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    const edit = await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['incapacitated'] },
    });
    await expectUnsafe(world, declined, edit);
    expect(codeOf(await undo(world, edit))).toBe('accepted');
    expect(codeOf(await undo(world, declined))).toBe('accepted');
    expect(codeOf(await world.dm(closeWindow(windowId)))).toBe('accepted');
    await verifyHistory(world);
  });

  it('a character’s suspended cast, countered, then the caster incapacitated: unsafe', async () => {
    const world = await twoCasters();
    await world.submit(cast(ELOWEN, 'detect-magic'));
    const windowId = await openWindowId(world);
    world.roll(20, 1);
    const answer = await world.submit(counterspell(SEREN, windowId), SEREN_PLAYER);
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    const edit = await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['incapacitated'] },
    });
    await expectUnsafe(world, answer, edit);
    await verifyHistory(world);
  });

  it('time advanced after the window closed: unsafe; unrelated knowledge does not block', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 1);
    const answer = await world.submit(counterspell(ELOWEN, windowId));
    const note = await world.dm({
      type: 'AddKnowledge',
      scope: { kind: 'DM' },
      knowledgeType: 'SECRET',
      statement: 'The Shaman fled the Circle.',
      subjects: [SHAMAN],
      knownSince: null,
    });
    expect(codeOf(note)).toBe('accepted');
    const later = await world.dm({ type: 'AdvanceWorldTime', by: 60 });
    expect(codeOf(later)).toBe('accepted');
    await expectUnsafe(world, answer, later);
    expect(codeOf(await undo(world, later))).toBe('accepted');
    expect(codeOf(await undo(world, answer))).toBe('accepted');
    expect((await world.state()).reactionWindows.get(windowId)?.status).toBe('open');
    await verifyHistory(world);
  });
});

describe('G03-H02 missed_attack_blocks_undo_of_target_defense', () => {
  it('a miss depends on the target’s Armor Class; recovery undoes the attack first', async () => {
    const world = await twoCasters();
    const sheet = (await world.state()).characterSheets.get(SEREN);
    if (!sheet) throw new Error('no sheet');
    const edit = await world.dm({
      type: 'SetCharacterSheet',
      entityId: SEREN,
      sheet: { ...sheet, armorClass: 30 },
    });
    world.roll(20, 10);
    const attack = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: SEREN,
    });
    expect(attack.status === 'accepted' && attack.outcome).toMatchObject({ hit: false });
    await expectUnsafe(world, edit, attack);
    await verifyHistory(world);
    expect(codeOf(await undo(world, attack))).toBe('accepted');
    expect(codeOf(await undo(world, edit))).toBe('accepted');
    await verifyHistory(world);
  });

  it('depends on the target’s conditions', async () => {
    const world = await twoCasters();
    const sheet = (await world.state()).characterSheets.get(SEREN);
    if (!sheet) throw new Error('no sheet');
    const edit = await world.dm({
      type: 'SetCharacterSheet',
      entityId: SEREN,
      sheet: { ...sheet, conditions: ['prone'] },
    });
    world.roll(20, 2, 2);
    const attack = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: SEREN,
    });
    expect(codeOf(attack)).toBe('accepted');
    await expectUnsafe(world, edit, attack);
    await verifyHistory(world);
  });

  it('depends on the target being alive', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({ type: 'ChangeEntityStatus', entityId: RAIDER_2, status: 'dead' });
    const revived = await world.dm({
      type: 'ChangeEntityStatus',
      entityId: RAIDER_2,
      status: 'active',
    });
    world.roll(20, 1);
    const attack = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: RAIDER_2,
    });
    expect(codeOf(attack)).toBe('accepted');
    await expectUnsafe(world, revived, attack);
    await verifyHistory(world);
  });

  it('turn order depends on who is alive', async () => {
    const world = await roadWorld();
    await startAmbush(world); // Elowen, Shaman, Raiders
    const death = await world.dm({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' });
    const ended = await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
    expect(ended.status === 'accepted' && ended.outcome).toMatchObject({
      nextCombatantId: 'creature-10fb59d4',
    });
    await expectUnsafe(world, death, ended);
    await verifyHistory(world);
  });
});

describe('G03-H03 detect_magic_discloses_only_within_30_feet_in_combat', () => {
  type Start = typeof AMBUSH.startCombat;
  const shamanAt =
    (distanceFt: number) =>
    (command: Start): Record<string, unknown> => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === SHAMAN ? { ...c, position: { x: 2 + distanceFt / 5, y: 1 } } : c,
      ),
    });
  const clue = (statement: string, entityId = SHAMAN) => ({
    type: 'AddClue',
    entityId,
    method: 'magic',
    statement,
    subjects: [],
  });
  const disclosed = async (world: RoadWorld, statement: string) => {
    const state = await world.state();
    return {
      knowledge: [...state.knowledge.values()].some((k) => k.statement === statement),
      memory: [...state.memories.values()].some((m) => m.summary.includes(statement)),
    };
  };

  it.each([
    [30, true],
    [35, false],
    [50, false],
  ])('a cast at once: a clue %i ft away is disclosed: %s', async (distanceFt, expected) => {
    const world = await roadWorld();
    await startAmbush(world, undefined, shamanAt(distanceFt));
    await world.dm(clue('G03_RANGE'));
    expect(codeOf(await world.submit(cast(ELOWEN, 'detect-magic')))).toBe('accepted');
    expect(await disclosed(world, 'G03_RANGE')).toEqual({ knowledge: expected, memory: expected });
    await verifyHistory(world);
  });

  it.each([
    ['declined', 30, true],
    ['declined', 50, false],
    ['closed', 30, true],
    ['closed', 50, false],
  ])(
    'a suspended cast %s: a clue %i ft away is disclosed: %s',
    async (how, distanceFt, expected) => {
      const world = await roadWorld();
      await addSeren(world);
      await startAmbush(world, [17, 3, 2, 1, 15, 5], (command: Start) =>
        withSeren()(shamanAt(distanceFt)(command) as Start),
      );
      await world.dm(clue('G03_SUSPENDED'));
      await world.submit(cast(ELOWEN, 'detect-magic'));
      const windowId = await openWindowId(world);
      const closing =
        how === 'declined'
          ? await world.submit(ignore(SEREN, windowId), SEREN_PLAYER)
          : await world.dm(closeWindow(windowId));
      expect(codeOf(closing)).toBe('accepted');
      expect(await disclosed(world, 'G03_SUSPENDED')).toEqual({
        knowledge: expected,
        memory: expected,
      });
      await verifyHistory(world);
    },
  );

  it('senses nothing without a battlefield square during combat, and the room after it', async () => {
    const world = await roadWorld();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'ashen-charm',
      kind: 'item',
      name: 'Ashen Charm',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    });
    await startAmbush(world);
    await world.dm(clue('G03_OFF_GRID', 'ashen-charm'));
    await world.submit(cast(ELOWEN, 'detect-magic'));
    expect(await disclosed(world, 'G03_OFF_GRID')).toEqual({ knowledge: false, memory: false });
    const { encounterId } = await world.encounter();
    expect(codeOf(await world.dm({ type: 'EndCombat', encounterId }))).toBe('accepted');
    await world.submit(cast(ELOWEN, 'detect-magic'));
    expect(await disclosed(world, 'G03_OFF_GRID')).toEqual({ knowledge: true, memory: true });
    await verifyHistory(world);
  });
});

describe('adjacent audit: every authoring rule that consults the encounter depends on it', () => {
  it('a stat block set after combat ended blocks undoing the end', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { encounterId } = await world.encounter();
    const ended = await world.dm({ type: 'EndCombat', encounterId });
    const block = (await world.state()).statBlocks.get(SHAMAN);
    if (!block) throw new Error('no stat block');
    const set = await world.dm({
      type: 'SetStatBlock',
      entityId: SHAMAN,
      statBlock: { ...block, armorClass: 14 },
    });
    expect(codeOf(set)).toBe('accepted');
    await expectUnsafe(world, ended, set);
    await verifyHistory(world);
  });
});

describe('adjacent audit: Detect Magic that found nothing still depends on why', () => {
  const magic = (entityId: string, statement: string) => ({
    type: 'AddClue',
    entityId,
    method: 'magic',
    statement,
    subjects: [],
  });
  const detect = cast(ELOWEN, 'detect-magic');

  it('a repeat cast relied on what the first one found', async () => {
    const world = await roadWorld();
    await world.dm(magic('mira-vale', 'Mira wears a warding ring.'));
    const first = await world.submit(detect);
    const second = await world.submit(detect);
    expect(second.status === 'accepted' && second.outcome).toMatchObject({ discovered: [] });
    await expectUnsafe(world, first, second);
    await verifyHistory(world);
  });

  it('a cast relied on where every magic-bearing thing was', async () => {
    const world = await roadWorld();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'ashen-charm',
      kind: 'item',
      name: 'Ashen Charm',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    await world.dm(magic('ashen-charm', 'The charm hums with ash-grey power.'));
    const moved = await world.dm({
      type: 'PlaceEntity',
      entityId: 'ashen-charm',
      locationId: 'north-gate',
    });
    const nothing = await world.submit(detect);
    expect(nothing.status === 'accepted' && nothing.outcome).toMatchObject({ discovered: [] });
    await expectUnsafe(world, moved, nothing);
    await verifyHistory(world);
  });

  it('a spell outside combat relied on its target being alive', async () => {
    const world = await roadWorld();
    await world.dm({ type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' });
    const revived = await world.dm({
      type: 'ChangeEntityStatus',
      entityId: 'mira-vale',
      status: 'active',
    });
    const marked = await world.submit(cast(ELOWEN, 'hunters-mark', { targetId: 'mira-vale' }));
    expect(codeOf(marked)).toBe('accepted');
    await expectUnsafe(world, revived, marked);
    await verifyHistory(world);
  });

  it('a cast relied on where the caster stood', async () => {
    const world = await roadWorld();
    await world.dm(magic('mira-vale', 'Mira wears a warding ring.'));
    const left = await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'golden-stag-inn',
    });
    expect(codeOf(left)).toBe('accepted');
    const nothing = await world.submit(detect);
    expect(nothing.status === 'accepted' && nothing.outcome).toMatchObject({ discovered: [] });
    await expectUnsafe(world, left, nothing);
    await verifyHistory(world);
  });
});
