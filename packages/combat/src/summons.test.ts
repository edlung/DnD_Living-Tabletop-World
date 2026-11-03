import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  AMBUSH,
  DM,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The four summons (docs/adr/0056-characters-from-the-srd.md §5): a creature beside its caster
 * with the stat block its slot scales, sharing the caster's initiative right after the caster,
 * its player commanding it; gone when the caster's Concentration on the spell ends, when it drops
 * to 0 Hit Points, or when the caster calls up another with the same spell. Outside a fight it
 * waits at the caster's place, and a fight puts it after its caster.
 */
const SUMMONS = ['find-steed', 'giant-insect', 'summon-dragon', 'animate-objects'];

const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

/** Elowen with the four summons in her wizard's book (Intelligence 16: +3, spell attack +8). */
async function summoner(world: RoadWorld) {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const next: CharacterSheet = {
    ...sheet,
    spellcasting: sheet.spellcasting.map((source) =>
      source.source === 'wizard' ? { ...source, spells: [...source.spells, ...SUMMONS] } : source,
    ),
  };
  expect(codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: next }))).toBe(
    'accepted',
  );
}

const cast = (world: RoadWorld, spellId: string, slotLevel: number, summon: object) =>
  world.submit(
    { type: 'CastSpell', combatantId: ELOWEN, spellId, using: { slotLevel }, summon },
    PLAYER,
  );

/** The creatures a caster summoned, in the order they were made. */
const summonsOf = (state: WorldState, by = ELOWEN) =>
  [...state.statBlocks].filter(([, block]) => block.summoned?.by === by).map(([id]) => id);

const only = (state: WorldState) => {
  const [id] = summonsOf(state);
  if (id === undefined) throw new Error('nothing summoned');
  return id;
};

describe('Giant Insect in a fight', () => {
  it('calls up a spider beside its caster, right after her, her player commanding it', async () => {
    const world = await roadWorld();
    await summoner(world);
    await startAmbush(world);
    // No option, or one its creature has not: refused before anything is spent.
    expect(reasonOf(await cast(world, 'giant-insect', 5, {}))).toBe('SUMMON_CHOICE');
    expect(reasonOf(await cast(world, 'giant-insect', 5, { option: 'fey' }))).toBe('SUMMON_CHOICE');
    expect(codeOf(await cast(world, 'giant-insect', 5, { option: 'spider' }))).toBe('accepted');
    const state = await world.state();
    const insect = only(state);
    expect(state.entities.get(insect)).toMatchObject({
      kind: 'creature',
      name: 'Giant Insect (Spider)',
      status: 'active',
    });
    const block = state.statBlocks.get(insect);
    // The 5th-level block: AC 11 + 5, 30 + 10 HP, two attacks, the caster's spell attack.
    expect(block).toMatchObject({
      size: 'large',
      armorClass: 16,
      hitPoints: { max: 40, current: 40 },
      attacksPerAction: 2,
      speeds: { climb: 40 },
      senses: { darkvision: 60 },
      summoned: { by: ELOWEN, spellId: 'giant-insect', creature: 'giant-insect', option: 'spider' },
    });
    expect(block?.attacks.map((one) => [one.attackId, one.bonus, one.damage.bonus])).toEqual([
      ['poison-jab', 8, 8],
      ['web-bolt', 8, 8],
    ]);
    const order = state.encounter?.combatants ?? [];
    const at = order.findIndex((one) => one.entityId === insect);
    expect(order[at - 1]?.entityId).toBe(ELOWEN);
    expect(order[at]).toMatchObject({
      side: 'party',
      commandedBy: ELOWEN,
      initiative: order[at - 1]?.initiative,
    });
    // It stands clear of its caster, within the spell's 60 feet.
    expect(order[at]?.position).toEqual({ x: 3, y: 5 });
    expect((await world.state()).characterSheets.get(ELOWEN)?.concentration?.spellId).toBe(
      'giant-insect',
    );
    await verifyHistory(world);
  });

  it('goes when its caster’s Concentration ends, or when it drops to 0 Hit Points', async () => {
    const world = await roadWorld();
    await summoner(world);
    await startAmbush(world);
    await cast(world, 'giant-insect', 4, { option: 'wasp' });
    const insect = only(await world.state());
    expect((await world.state()).statBlocks.get(insect)?.speeds).toEqual({ fly: 40, climb: 40 });
    // Damage and a failed Constitution save end the Concentration: the insect is gone.
    world.roll(20, 1);
    const hit = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 6,
      damageType: 'slashing',
      reason: 'An arrow',
    });
    expect(codeOf(hit)).toBe('accepted');
    const after = await world.state();
    expect(after.characterSheets.get(ELOWEN)?.concentration).toBeNull();
    expect(after.entities.get(insect)?.status).toBe('dead');
    expect(after.encounter?.combatants.some((one) => one.entityId === insect)).toBe(false);
    await verifyHistory(world);
  });

  it('drops out of the fight at 0 Hit Points and is never brought back', async () => {
    const world = await roadWorld();
    await summoner(world);
    await startAmbush(world);
    await cast(world, 'giant-insect', 4, { option: 'centipede' });
    const insect = only(await world.state());
    const blow = await world.dm({
      type: 'AdjustHitPoints',
      targetId: insect,
      change: 'damage',
      amount: 999,
      damageType: 'slashing',
      reason: 'A killing blow',
    });
    expect(codeOf(blow)).toBe('accepted');
    const state = await world.state();
    expect(state.entities.get(insect)?.status).toBe('dead');
    expect(state.encounter?.combatants.some((one) => one.entityId === insect)).toBe(false);
    await verifyHistory(world);
  });
});

describe('Find Steed', () => {
  it('waits at its caster’s place outside a fight, is replaced by the next, and follows her into one', async () => {
    const world = await roadWorld();
    await summoner(world);
    for (const place of AMBUSH.place) expect(codeOf(await world.dm(place))).toBe('accepted');
    expect(codeOf(await cast(world, 'find-steed', 2, { option: 'fey' }))).toBe('accepted');
    const first = only(await world.state());
    const second = await cast(world, 'find-steed', 4, { option: 'celestial' });
    expect(codeOf(second)).toBe('accepted');
    const state = await world.state();
    const [, steed] = summonsOf(state);
    if (steed === undefined) throw new Error('no second steed');
    expect(state.entities.get(first)?.status).toBe('dead');
    expect(state.entities.get(steed)?.placement?.locationId).toBe(
      state.entities.get(ELOWEN)?.placement?.locationId,
    );
    // The 4th-level steed flies; its Slam is radiant for a Celestial.
    expect(state.statBlocks.get(steed)).toMatchObject({
      armorClass: 14,
      hitPoints: { max: 45, current: 45 },
      speedFt: 60,
      speeds: { fly: 60 },
    });
    expect(state.statBlocks.get(steed)?.attacks[0]?.damage).toEqual({
      count: 1,
      sides: 8,
      bonus: 4,
      type: 'radiant',
    });
    world.roll(20, 17, 3, 2, 1, 15, 9);
    const start = structuredClone(AMBUSH.startCombat);
    const started = await world.dm({
      ...start,
      combatants: [
        ...start.combatants,
        { entityId: steed, side: 'party', position: { x: 2, y: 8 } },
      ],
    });
    expect(codeOf(started)).toBe('accepted');
    const order = (await world.encounter()).combatants;
    const at = order.findIndex((one) => one.entityId === steed);
    expect(order[at - 1]?.entityId).toBe(ELOWEN);
    expect(order[at]).toMatchObject({ commandedBy: ELOWEN, initiative: order[at - 1]?.initiative });
    await verifyHistory(world);
  });
});

describe('Summon Dragon', () => {
  /** The spirit on its turn, a raider beside it and another 10 feet off. */
  async function spiritsTurn() {
    const world = await roadWorld();
    await summoner(world);
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((one) =>
        one.entityId === RAIDER_1
          ? { ...one, position: { x: 6, y: 5 } }
          : one.entityId === RAIDER_2
            ? { ...one, position: { x: 6, y: 7 } }
            : one,
      ),
    }));
    expect(codeOf(await cast(world, 'summon-dragon', 5, { option: 'cold' }))).toBe('accepted');
    const dragon = only(await world.state());
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER))).toBe(
      'accepted',
    );
    expect((await world.encounter()).combatants[1]?.entityId).toBe(dragon);
    const breath = () =>
      world.submit(
        {
          type: 'UseCreatureAction',
          combatantId: dragon,
          actionId: 'breath-weapon',
          point: { x: 6, y: 5 },
        },
        PLAYER,
      );
    const rend = (targetId: string) =>
      world.submit({ type: 'Attack', combatantId: dragon, attackId: 'rend', targetId }, PLAYER);
    return { world, dragon, breath, rend };
  }

  it('is a 5th-level spirit whose breath begins its Multiattack, its Rends following', async () => {
    const { world, dragon, breath, rend } = await spiritsTurn();
    expect((await world.state()).statBlocks.get(dragon)).toMatchObject({
      armorClass: 19,
      hitPoints: { max: 50, current: 50 },
      attacksPerAction: 2,
      resistances: ['acid', 'cold', 'fire', 'lightning', 'poison'],
      conditionImmunities: ['charmed', 'frightened', 'poisoned'],
    });
    expect((await world.state()).statBlocks.get(dragon)?.saveActions?.[0]).toMatchObject({
      dc: 16,
      damage: [{ count: 2, sides: 6, bonus: 0, type: 'cold' }],
      inMultiattack: true,
    });
    expect(codeOf(await breath())).toBe('accepted');
    expect(codeOf(await rend(RAIDER_1))).toBe('accepted');
    expect(codeOf(await rend(RAIDER_2))).toBe('accepted');
    expect(reasonOf(await rend(RAIDER_2))).toBe('TARGET_DEAD');
    expect(reasonOf(await breath())).toBe('USED_THIS_TURN');
    // Someone who does not command it may not run its turn.
    const stranger = await world.submit(
      { type: 'EndTurn', combatantId: dragon },
      { actorId: 'player-stranger', kind: 'user' },
    );
    expect(codeOf(stranger)).toBe('FORBIDDEN');
    expect(codeOf(await world.dm({ type: 'EndTurn', combatantId: dragon }))).toBe('accepted');
    await verifyHistory(world);
  });

  it('breathes after its Rends too, once a turn', async () => {
    const { world, breath, rend } = await spiritsTurn();
    expect(codeOf(await rend(RAIDER_1))).toBe('accepted');
    expect(codeOf(await rend(RAIDER_2))).toBe('accepted');
    expect(codeOf(await breath())).toBe('accepted');
    expect(reasonOf(await breath())).toBe('USED_THIS_TURN');
    await verifyHistory(world);
  });
});

describe('Animate Objects', () => {
  it('animates as many as the caster’s modifier allows, a Large counting two', async () => {
    const world = await roadWorld();
    await summoner(world);
    await startAmbush(world);
    // Intelligence +3: a Huge one and a Medium one are four, too many.
    expect(
      reasonOf(
        await cast(world, 'animate-objects', 5, { objects: { medium: 1, large: 0, huge: 1 } }),
      ),
    ).toBe('SUMMON_CHOICE');
    const made = await cast(world, 'animate-objects', 6, {
      objects: { medium: 1, large: 1, huge: 0 },
    });
    expect(codeOf(made)).toBe('accepted');
    const state = await world.state();
    const objects = summonsOf(state);
    expect(objects.map((id) => state.entities.get(id)?.name)).toEqual([
      'Animated Object (Large) 1',
      'Animated Object (Medium) 2',
    ]);
    // A 6th-level slot: one more die for each; the Large one adds the caster's modifier.
    expect(objects.map((id) => state.statBlocks.get(id)?.attacks[0]?.damage)).toEqual([
      { count: 3, sides: 6, bonus: 6, type: 'force' },
      { count: 2, sides: 4, bonus: 3, type: 'force' },
    ]);
    const order = state.encounter?.combatants.map((one) => one.entityId) ?? [];
    expect(order.slice(0, 3)).toEqual([ELOWEN, ...objects]);
    await verifyHistory(world);
  });
});

describe('who may summon', () => {
  it('is the caster’s player or the DM, as for any spell', async () => {
    const world = await roadWorld();
    await summoner(world);
    const stranger = await world.submit(
      {
        type: 'CastSpell',
        combatantId: ELOWEN,
        spellId: 'find-steed',
        using: { slotLevel: 2 },
        summon: { option: 'fiend' },
      },
      { actorId: 'player-stranger', kind: 'user' },
    );
    expect(codeOf(stranger)).toBe('FORBIDDEN');
    const dm = await world.submit(
      {
        type: 'CastSpell',
        combatantId: ELOWEN,
        spellId: 'find-steed',
        using: { slotLevel: 2 },
        summon: { option: 'fiend' },
      },
      DM,
    );
    expect(codeOf(dm)).toBe('accepted');
  });
});
