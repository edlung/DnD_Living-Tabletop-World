import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  openWindowId,
  recorded,
  roadWorld,
  startAmbush,
} from './testing/road.ts';

/**
 * `CastSpell` (ADR 0015 §3). Elowen's spell save DC is 16; Raider 1 is in
 * half cover at (8,4), the Shaman in three-quarters cover at (12,6).
 */
const cast = (spellId: string, extra: Record<string, unknown> = {}) => ({
  type: 'CastSpell',
  combatantId: ELOWEN,
  spellId,
  ...extra,
});
const message = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('Fireball', () => {
  it('hits everyone in 20 ft, with cover on the Dexterity save and half damage on a success', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(6, 3, 3, 3, 3, 3, 3, 3, 3);
    world.roll(20, 20, 1, 1, 15); // Shaman, Raider 1, Raider 2, Raider 3 (initiative order)
    const fireball = await world.submit(cast('fireball', { point: { x: 10, y: 6 } }));
    expect(codeOf(fireball)).toBe('accepted');
    const events = await recorded(world, fireball);
    const saves = events.flatMap((e) =>
      e.type === 'SavingThrowRolled'
        ? [[e.payload.creatureId, e.payload.modifier, e.payload.success]]
        : [],
    );
    expect(saves).toEqual([
      [SHAMAN, 7, true],
      [RAIDER_1, 4, false],
      [RAIDER_2, 2, false],
      [RAIDER_3, 2, true],
    ]);
    const state = await world.state();
    expect(state.statBlocks.get(SHAMAN)?.hitPoints.current).toBe(21 - 12);
    for (const id of [RAIDER_1, RAIDER_2, RAIDER_3]) {
      expect(state.entities.get(id)?.status).toBe('dead');
    }
    expect(state.characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(1);
    expect(fireball.status === 'accepted' && fireball.outcome).toMatchObject({
      kind: 'CastSpell',
      spellId: 'fireball',
    });
  });

  it('includes the caster and breaks her Concentration on a failed save', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.submit(cast('hunters-mark', { targetId: RAIDER_1 }));
    world.roll(6, 6, 6, 6, 6, 6, 6, 6, 6);
    world.roll(20, 1, 1, 1); // Elowen's save, her Concentration save, Raider 1's save
    const fireball = await world.submit(cast('fireball', { point: { x: 4, y: 6 } }));
    const events = await recorded(world, fireball);
    expect(
      events.flatMap((e) =>
        e.type === 'SavingThrowRolled'
          ? [[e.payload.creatureId, e.payload.purpose, e.payload.dc]]
          : [],
      ),
    ).toEqual([
      [ELOWEN, 'spell', 16],
      [ELOWEN, 'concentration', 24],
      [RAIDER_1, 'spell', 16],
    ]);
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.hitPoints.current).toBe(78 - 48);
    expect(sheet?.concentration).toBeNull();
  });

  it('needs combat and a point on the battlefield', async () => {
    const world = await roadWorld();
    expect(message(await world.submit(cast('fireball', { point: { x: 1, y: 1 } })))).toBe(
      'NOT_IN_COMBAT',
    );
    await startAmbush(world);
    expect(message(await world.submit(cast('fireball')))).toBe('TARGET_REQUIRED');
    expect(message(await world.submit(cast('fireball', { point: { x: 39, y: 1 } })))).toBe(
      'DESTINATION_INVALID',
    );
  });
});

describe('other slice spells', () => {
  it('Misty Step teleports up to 30 ft to an open square', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(message(await world.submit(cast('misty-step', { point: { x: 3, y: 2 } })))).toBe(
      'DESTINATION_INVALID',
    );
    expect(message(await world.submit(cast('misty-step', { point: { x: 9, y: 6 } })))).toBe(
      'OUT_OF_RANGE',
    );
    expect(codeOf(await world.submit(cast('misty-step', { point: { x: 5, y: 6 } })))).toBe(
      'accepted',
    );
    const elowen = (await world.encounter()).combatants[0];
    expect(elowen).toMatchObject({ position: { x: 5, y: 6 }, turn: { bonusActionUsed: true } });
  });

  it('Healing Word restores 2d4 + Wisdom modifier with the free cast', async () => {
    const world = await roadWorld();
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, hitPoints: { max: 78, current: 50 } },
    });
    await startAmbush(world);
    world.roll(4, 4, 4);
    const healed = await world.submit(cast('healing-word', { targetId: ELOWEN }));
    expect(healed.status === 'accepted' && healed.outcome).toMatchObject({
      results: [{ targetId: ELOWEN, healed: 10 }],
    });
    const after = (await world.state()).characterSheets.get(ELOWEN);
    expect(after?.hitPoints.current).toBe(60);
    expect(after?.spellcasting[2]?.freeCasts?.used).toBe(1);
  });

  it('Counterspell has no trigger before reactions exist', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(message(await world.submit(cast('counterspell')))).toBe('NO_VALID_TRIGGER');
  });

  it('Detect Magic reveals magic clues on what Elowen perceives, outside combat', async () => {
    const world = await roadWorld();
    await world.dm({
      type: 'AddClue',
      clueId: 'clue-mira-charm',
      entityId: 'mira-vale',
      method: 'magic',
      statement: 'A faint warding charm hangs on Mira’s ledger.',
      subjects: [],
    });
    const detected = await world.submit(cast('detect-magic'));
    expect(codeOf(detected)).toBe('accepted');
    const types = (await recorded(world, detected)).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'SpellCast',
        'EvidenceExamined',
        'KnowledgeAssigned',
        'MemoryRecorded',
      ]),
    );
    const outcome = detected.status === 'accepted' ? detected.outcome : undefined;
    expect(outcome?.kind === 'CastSpell' && outcome.discovered).toHaveLength(1);
    const again = await world.submit(cast('detect-magic'));
    expect(again.status === 'accepted' && again.outcome).toMatchObject({ discovered: [] });
  });
});

describe('goblin spells', () => {
  it('Ashen Bolt beyond Counterspell range is a spell attack that resolves at once', async () => {
    const world = await roadWorld();
    // The Shaman 65 ft away: inside Ashen Bolt's 120 ft, outside Counterspell's 60 ft.
    await startAmbush(world, undefined, (command) => ({
      ...command,
      battlefield: { ...command.battlefield, width: 20 },
      combatants: command.combatants.map((c) =>
        c.entityId === SHAMAN ? { ...c, position: { x: 15, y: 6 } } : c,
      ),
    }));
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
    world.roll(20, 15);
    world.roll(8, 4, 4);
    const bolt = await world.dm({
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'ashen-bolt',
      targetId: ELOWEN,
    });
    const events = await recorded(world, bolt);
    expect(events.map((e) => e.type)).not.toContain('ReactionWindowOpened');
    expect(events.find((e) => e.type === 'SpellCast')?.payload).toMatchObject({
      free: true,
      slotLevel: null,
    });
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.current).toBe(70);
  });

  it('Binding Hex within range waits for Elowen; ignoring it lets the Wisdom save for half happen', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
    const hex = await world.dm({
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'binding-hex',
      targetId: ELOWEN,
    });
    expect((await recorded(world, hex)).map((e) => e.type)).toContain('ReactionWindowOpened');
    const windowId = await openWindowId(world);
    world.roll(20, 15);
    world.roll(6, 6, 6);
    const ignored = await world.submit({ type: 'DeclineReaction', combatantId: ELOWEN, windowId });
    expect(ignored.status === 'accepted' && ignored.outcome).toEqual({
      kind: 'DeclineReaction',
      windowId,
      trigger: 'spell',
    });
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.current).toBe(72);
    const again = await world.dm({
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'binding-hex',
      targetId: ELOWEN,
    });
    expect(message(again)).toBe('NO_ACTION');
  });
});
