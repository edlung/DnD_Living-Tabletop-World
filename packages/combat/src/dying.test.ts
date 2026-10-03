import { describe, expect, it } from 'vitest';

import { applyDamage, applyHealing } from './damage.ts';
import {
  ELOWEN,
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
import { vitalsOf } from './vitals.ts';

/**
 * 0 HP (ADR 0015 §4, SRD death saves). Elowen starts at 1 HP with Raiders 1
 * and 2 next to her; turn order: Elowen, Shaman, Raider 1, Raider 2, Raider 3.
 */
async function knockedOut(): Promise<RoadWorld> {
  const world = await roadWorld();
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, hitPoints: { max: 78, current: 1 } },
  });
  await startAmbush(world, undefined, (command) => ({
    ...command,
    combatants: command.combatants.map((c) =>
      c.entityId === RAIDER_1
        ? { ...c, position: { x: 3, y: 6 } }
        : c.entityId === RAIDER_2
          ? { ...c, position: { x: 3, y: 7 } }
          : c,
    ),
  }));
  await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
  await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
  world.roll(20, 15);
  world.roll(6, 1);
  const hit = await world.dm(scimitar(RAIDER_1));
  expect(codeOf(hit)).toBe('accepted');
  await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
  return world;
}
const scimitar = (combatantId: string) => ({
  type: 'Attack',
  combatantId,
  attackId: 'scimitar',
  targetId: ELOWEN,
});
const elowenSheet = async (world: RoadWorld) => (await world.state()).characterSheets.get(ELOWEN);

describe('a character at 0 HP', () => {
  it('falls Unconscious and Prone, and a close hit is a critical with the goblin’s extra die', async () => {
    const world = await knockedOut();
    expect(await elowenSheet(world)).toMatchObject({
      hitPoints: { current: 0 },
      conditions: ['unconscious', 'prone'],
      deathSaves: { successes: 0, failures: 0 },
    });
    world.roll(20, 5, 15);
    world.roll(6, 1, 1);
    world.roll(4, 1, 1);
    const crit = await world.dm(scimitar(RAIDER_2));
    const events = await recorded(world, crit);
    expect(events.find((e) => e.type === 'AttackPerformed')?.payload).toMatchObject({
      advantage: true,
      critical: true,
      hit: true,
    });
    expect(events.find((e) => e.type === 'DamageApplied')?.payload).toMatchObject({
      amount: 6,
      rolls: [1, 1, 1, 1],
      hpBefore: 0,
      hpAfter: 0,
    });
    expect((await elowenSheet(world))?.deathSaves).toEqual({ successes: 0, failures: 2 });
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_2 });
    world.roll(20, 1);
    const turn = await world.dm({ type: 'EndTurn', combatantId: RAIDER_3 });
    const save = (await recorded(world, turn)).find((e) => e.type === 'DeathSaveRolled');
    expect(save?.payload).toMatchObject({ roll: 1, failures: 3, outcome: 'dead' });
    expect((await world.state()).entities.get(ELOWEN)?.status).toBe('dead');
  });

  it('regains 1 HP on a natural 20, stays Prone, and stands up for half her Speed', async () => {
    const world = await knockedOut();
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_2 });
    world.roll(20, 20);
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_3 });
    const sheet = await elowenSheet(world);
    expect(sheet).toMatchObject({ hitPoints: { current: 1 }, conditions: ['prone'] });
    expect(sheet?.deathSaves).toBeUndefined();
    const path = (n: number) => ({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: Array.from({ length: n }, (_, i) => ({ x: 1 - Math.min(i, 1), y: 6 - i })),
    });
    expect(codeOf(await world.submit(path(4)))).toBe('ILLEGAL_ACTION');
    expect(codeOf(await world.submit(path(3)))).toBe('accepted');
    expect((await elowenSheet(world))?.conditions).toEqual([]);
  });

  it('becomes stable after three successes and stops rolling', async () => {
    const world = await knockedOut();
    for (let round = 0; round < 4; round += 1) {
      await world.dm({ type: 'EndTurn', combatantId: RAIDER_2 });
      world.roll(20, 10);
      const turn = await world.dm({ type: 'EndTurn', combatantId: RAIDER_3 });
      const saved = (await recorded(world, turn)).some((e) => e.type === 'DeathSaveRolled');
      expect(saved).toBe(round < 3);
      for (const id of [ELOWEN, SHAMAN, RAIDER_1]) {
        await world.dm({ type: 'EndTurn', combatantId: id });
      }
    }
    expect((await elowenSheet(world))?.deathSaves).toEqual({ successes: 3, failures: 0 });
    expect((await world.state()).entities.get(ELOWEN)?.status).toBe('active');
  });
});

describe('damage and healing rules', () => {
  const noDice = {
    roll: () => {
      throw new Error('no roll expected');
    },
  };

  it('kills outright from massive damage', async () => {
    const world = await roadWorld();
    const state = await world.state();
    const elowen = vitalsOf(state, ELOWEN);
    if (!elowen) throw new Error('no vitals');
    const applied = applyDamage(state, noDice, elowen, {
      sourceId: RAIDER_1,
      amount: 78 + 78,
      damageType: 'slashing',
      rolls: [],
      critical: false,
    });
    expect(applied.events.map((e) => e.type)).toEqual([
      'DamageApplied',
      'CharacterSheetSet',
      'EntityStatusChanged',
    ]);
  });

  it('wakes a dying character on healing but leaves her Prone', async () => {
    const world = await knockedOut();
    const dying = vitalsOf(await world.state(), ELOWEN);
    if (!dying) throw new Error('no vitals');
    const healed = applyHealing(dying, { sourceId: ELOWEN, amount: 5, rolls: [2, 3] });
    expect(healed.vitals.kind === 'character' && healed.vitals.sheet).toMatchObject({
      hitPoints: { current: 5 },
      conditions: ['prone'],
    });
    expect(healed.vitals.kind === 'character' && healed.vitals.sheet.deathSaves).toBeUndefined();
  });
});
