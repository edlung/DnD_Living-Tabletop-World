import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * The conditions in a fight (docs/adr/0045-conditions-and-actions.md §1, §3): what they do to
 * attacks, saves, movement, Concentration, damage and Initiative, through the World Engine. Elowen
 * stands at (2,6) with her longbow (+11); Raider 1 at (8,4), 30 ft away.
 */
const condition = (
  targetId: string,
  name: string,
  details?: Record<string, unknown>,
  applied = true,
) => ({
  type: 'SetCondition',
  targetId,
  condition: name,
  applied,
  ...(details ? { details } : {}),
  reason: 'The table says so',
});
const shoot = (targetId: string) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId: 'longbow',
  targetId,
});
const message = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;

async function attackFlags(world: RoadWorld, targetId: string) {
  world.roll(20, 15, 15);
  const shot = await world.submit(shoot(targetId), PLAYER);
  expect(codeOf(shot)).toBe('accepted');
  const performed = (await recorded(world, shot)).find((e) => e.type === 'AttackPerformed');
  if (performed?.type !== 'AttackPerformed') throw new Error('no attack recorded');
  return performed.payload;
}

describe('conditions in a fight', () => {
  it('shape attack rolls: Poisoned worsens the attacker, Restrained exposes the target', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(codeOf(await world.dm(condition(ELOWEN, 'poisoned')))).toBe('accepted');
    expect(await attackFlags(world, RAIDER_1)).toMatchObject({
      advantage: false,
      disadvantage: true,
    });
    expect(codeOf(await world.dm(condition(RAIDER_2, 'restrained')))).toBe('accepted');
    expect(await attackFlags(world, RAIDER_2)).toMatchObject({
      advantage: true,
      disadvantage: true,
    });
  });

  it('keep a Charmed creature from attacking its charmer, and no one else', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const charmed = await world.dm(condition(ELOWEN, 'charmed', { sourceId: RAIDER_1 }));
    expect(codeOf(charmed)).toBe('accepted');
    const refused = await world.submit(shoot(RAIDER_1), PLAYER);
    expect(codeOf(refused)).toBe('ILLEGAL_ACTION');
    expect(message(refused)).toBe('CHARMED_BY_TARGET');
    world.roll(20, 15);
    expect(codeOf(await world.submit(shoot(RAIDER_2), PLAYER))).toBe('accepted');
  });

  it('keep a Frightened creature from stepping closer to its fear', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(condition(ELOWEN, 'frightened', { sourceId: RAIDER_1 }));
    const closer = await world.submit(
      { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 3, y: 6 }] },
      PLAYER,
    );
    expect(message(closer)).toBe('CLOSER_TO_FEAR');
    const away = await world.submit(
      { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 1, y: 6 }] },
      PLAYER,
    );
    expect(codeOf(away)).toBe('accepted');
    // Its attacks have Disadvantage while the source is in the fight.
    expect((await attackFlags(world, RAIDER_2)).disadvantage).toBe(true);
  });

  it('let Grappled worsen attacks on anyone but the grappler', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(condition(ELOWEN, 'grappled', { sourceId: RAIDER_1 }));
    expect((await attackFlags(world, RAIDER_1)).disadvantage).toBe(false);
    expect((await attackFlags(world, RAIDER_2)).disadvantage).toBe(true);
  });

  it('fail a Paralyzed creature’s Dexterity save outright: no die for it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(condition(RAIDER_2, 'paralyzed'));
    world.roll(6, 3, 3, 3, 3, 3, 3, 3, 3);
    world.roll(20, 20, 1, 15); // Shaman, Raider 1, Raider 3: Raider 2 rolls none
    const fireball = await world.submit(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'fireball', point: { x: 10, y: 6 } },
      PLAYER,
    );
    expect(codeOf(fireball)).toBe('accepted');
    const saves = (await recorded(world, fireball)).flatMap((e) =>
      e.type === 'SavingThrowRolled' ? [[e.payload.creatureId, e.payload.rolls.length]] : [],
    );
    expect(saves).toContainEqual([RAIDER_2, 0]);
    expect(saves).toContainEqual([RAIDER_3, 1]);
  });

  it('halve damage to the Petrified and end the Stunned caster’s Concentration', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(condition(SHAMAN, 'petrified'));
    const before = (await world.state()).statBlocks.get(SHAMAN)?.hitPoints.current ?? 0;
    await world.dm({
      type: 'AdjustHitPoints',
      targetId: SHAMAN,
      change: 'damage',
      amount: 10,
      damageType: 'fire',
      reason: 'The brazier',
    });
    expect((await world.state()).statBlocks.get(SHAMAN)?.hitPoints.current).toBe(before - 5);
    expect(message(await world.dm(condition(SHAMAN, 'poisoned')))).toBe('It cannot take hold');

    world.roll(20, 15);
    const marked = await world.submit(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'hunters-mark', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(codeOf(marked)).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.concentration).not.toBeNull();
    await world.dm(condition(ELOWEN, 'stunned'));
    expect((await world.state()).characterSheets.get(ELOWEN)?.concentration).toBeNull();
  });

  it('give an Invisible creature Advantage on Initiative', async () => {
    const world = await roadWorld();
    await world.dm(condition(ELOWEN, 'invisible'));
    // Elowen rolls two d20s and keeps the higher; then the raiders and the Shaman.
    await startAmbush(world, [3, 18, 3, 2, 1, 15]);
    const elowen = (await world.encounter()).combatants.find((c) => c.entityId === ELOWEN);
    expect(elowen?.initiative.roll).toBe(18);
  });
});

describe('Exhaustion', () => {
  it('takes 2 a level from attack rolls, lifts at 0 and kills at 6', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const set = (targetId: string, level: number) =>
      world.dm({ type: 'SetExhaustion', targetId, level, reason: 'A long march' });
    expect(codeOf(await set(ELOWEN, 2))).toBe('accepted');
    expect(codeOf(await set(ELOWEN, 2))).toBe('NO_EFFECT');
    expect((await world.state()).characterSheets.get(ELOWEN)?.exhaustion).toBe(2);
    expect((await attackFlags(world, RAIDER_1)).modifier).toBe(11 - 4);
    await set(ELOWEN, 0);
    expect((await world.state()).characterSheets.get(ELOWEN)).not.toHaveProperty('exhaustion');
    expect(codeOf(await set(RAIDER_3, 6))).toBe('accepted');
    expect((await world.state()).entities.get(RAIDER_3)?.status).toBe('dead');
    // A player sets no Exhaustion.
    expect(
      codeOf(
        await world.submit(
          { type: 'SetExhaustion', targetId: ELOWEN, level: 1, reason: 'mine' },
          PLAYER,
        ),
      ),
    ).toBe('FORBIDDEN');
  });
});
