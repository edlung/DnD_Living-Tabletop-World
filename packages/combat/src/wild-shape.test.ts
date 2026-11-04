import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';
import { armorClass, saveModifier, sizeOf, speedOf, vitalsOf } from './vitals.ts';

/**
 * Wild Shape in play (docs/adr/0056-characters-from-the-srd.md §5): with a Bonus Action a Druid
 * takes a Beast form its level allows, gaining Temporary Hit Points equal to its Druid level; the
 * form's Armor Class, Strength, Dexterity and Constitution, size, speed and attacks are its own
 * while it keeps its Hit Points; it casts no spell; it leaves the form with a Bonus Action, or when
 * it drops Unconscious.
 */
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

/** Elowen as a 4th-level Druid: two uses of Wild Shape, forms up to Challenge Rating 1/2. */
async function druid(world: RoadWorld) {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const next: CharacterSheet = { ...sheet, classes: [{ classId: 'druid', level: 4 }] };
  expect(codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: next }))).toBe(
    'accepted',
  );
}

const shift = (world: RoadWorld, option: string) =>
  world.submit({ type: 'UseFeature', characterId: ELOWEN, feature: 'wild-shape', option }, PLAYER);

describe('Wild Shape in a fight', () => {
  it('takes a wolf’s body with a Bonus Action and bites with its jaws', async () => {
    const world = await roadWorld();
    await druid(world);
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((one) =>
        one.entityId === RAIDER_1 ? { ...one, position: { x: 3, y: 6 } } : one,
      ),
    }));
    const before = (await world.state()).characterSheets.get(ELOWEN);
    // A form beyond its level is refused, and so is a Large one with no room where it stands.
    expect(reasonOf(await shift(world, 'brown-bear'))).toBe('NOT_A_FORM');
    expect(reasonOf(await shift(world, 'riding-horse'))).toBe('NO_ROOM');
    expect(codeOf(await shift(world, 'wolf'))).toBe('accepted');
    const state = await world.state();
    const sheet = state.characterSheets.get(ELOWEN);
    expect(sheet?.shape).toEqual({ formId: 'wolf' });
    // Its own Hit Points, with Temporary ones equal to its Druid level.
    expect(sheet?.hitPoints).toMatchObject({
      current: before?.hitPoints.current,
      temporary: 4,
    });
    const vitals = vitalsOf(state, ELOWEN);
    if (!vitals) throw new Error('no vitals');
    expect([armorClass(vitals), speedOf(vitals), sizeOf(vitals)]).toEqual([12, 40, 'medium']);
    // The wolf's Dexterity (15) with Elowen's own proficiency where she has it.
    expect(saveModifier(vitals, 'dex')).toBeGreaterThanOrEqual(2);
    // No weapon in its paws, no spell on its tongue.
    expect(
      reasonOf(
        await world.submit(
          { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: RAIDER_1 },
          PLAYER,
        ),
      ),
    ).toBe('NO_WEAPON');
    expect(
      reasonOf(
        await world.submit(
          { type: 'CastSpell', combatantId: ELOWEN, spellId: 'hunters-mark', targetId: RAIDER_1 },
          PLAYER,
        ),
      ),
    ).toBe('SHAPED');
    world.roll(20, 15);
    const bite = await world.submit(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'bite', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(codeOf(bite)).toBe('accepted');
    // Its Bonus Action went on the form: leaving it waits for the next turn.
    expect(
      reasonOf(
        await world.submit(
          { type: 'UseFeature', characterId: ELOWEN, feature: 'end-wild-shape' },
          PLAYER,
        ),
      ),
    ).toBe('NO_BONUS_ACTION');
    await verifyHistory(world);
  });

  it('ends when the Druid drops Unconscious', async () => {
    const world = await roadWorld();
    await druid(world);
    await startAmbush(world);
    await shift(world, 'wolf');
    const blow = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 200,
      damageType: 'slashing',
      reason: 'A crushing blow',
    });
    expect(codeOf(blow)).toBe('accepted');
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.hitPoints.current).toBe(0);
    expect(sheet?.shape).toBeUndefined();
    await verifyHistory(world);
  });
});

describe('Wild Shape outside a fight', () => {
  it('is taken and left with no turn to pay for it', async () => {
    const world = await roadWorld();
    await druid(world);
    expect(codeOf(await shift(world, 'spider'))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.shape).toEqual({ formId: 'spider' });
    const leave = await world.submit(
      { type: 'UseFeature', characterId: ELOWEN, feature: 'end-wild-shape' },
      PLAYER,
    );
    expect(codeOf(leave)).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.shape).toBeUndefined();
    expect(
      reasonOf(
        await world.submit(
          { type: 'UseFeature', characterId: ELOWEN, feature: 'end-wild-shape' },
          PLAYER,
        ),
      ),
    ).toBe('NOT_SHAPED');
    await verifyHistory(world);
  });
});
