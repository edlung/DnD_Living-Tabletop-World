import type { CharacterSheet, StatBlock } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Traits, legendary actions and difficulty (docs/adr/0053-monsters-as-data.md §3–4) on the Old
 * Trade Road: Raider 1 stands at (2, 5) beside Elowen at (2, 6), Raider 2 at (3, 6) beside her too.
 */
async function raiders(change: (block: StatBlock) => StatBlock): Promise<RoadWorld> {
  const world = await roadWorld();
  const block = (await world.state()).statBlocks.get(RAIDER_1) as StatBlock;
  expect(
    codeOf(await world.dm({ type: 'SetStatBlock', entityId: RAIDER_1, statBlock: change(block) })),
  ).toBe('accepted');
  await startAmbush(world, undefined, (command) => ({
    ...command,
    combatants: command.combatants.map((one: { entityId: string }) =>
      one.entityId === RAIDER_1
        ? { ...one, position: { x: 2, y: 5 } }
        : one.entityId === RAIDER_2
          ? { ...one, position: { x: 3, y: 6 } }
          : one,
    ),
  }));
  return world;
}

const melee = async (world: RoadWorld) =>
  (await world.state()).statBlocks.get(RAIDER_1)?.attacks.find((one) => one.kind === 'melee')
    ?.attackId ?? '';

async function turnOf(world: RoadWorld, entityId: string) {
  for (let step = 0; step < 8; step += 1) {
    const encounter = await world.encounter();
    const current = encounter.combatants[encounter.currentIndex]?.entityId;
    if (current === entityId) return;
    await world.dm({ type: 'EndTurn', combatantId: current });
  }
}

describe('traits', () => {
  it('Pack Tactics: Advantage with an ally beside the target', async () => {
    const world = await raiders((block) => ({ ...block, traits: { packTactics: true } }));
    await turnOf(world, RAIDER_1);
    world.roll(20, 4, 17);
    const hit = await world.dm({
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId: await melee(world),
      targetId: ELOWEN,
    });
    expect(codeOf(hit)).toBe('accepted');
    expect(
      (await recorded(world, hit)).find((e) => e.type === 'AttackPerformed')?.payload,
    ).toMatchObject({
      advantage: true,
      rolls: [4, 17],
    });
  });

  it('Magic Resistance: Advantage on a save against a spell', async () => {
    const world = await raiders((block) => ({ ...block, traits: { magicResistance: true } }));
    const sheet = (await world.state()).characterSheets.get(ELOWEN) as CharacterSheet;
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        spellcasting: [
          ...sheet.spellcasting,
          { source: 'cleric', ability: 'wis', spells: ['sacred-flame'] },
        ],
      },
    });
    const flame = await world.submit(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'sacred-flame', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(codeOf(flame)).toBe('accepted');
    const save = (await recorded(world, flame)).find((e) => e.type === 'SavingThrowRolled');
    // Two d20s: the save has Advantage.
    expect(save?.payload).toMatchObject({ creatureId: RAIDER_1, purpose: 'spell' });
    expect(save?.type === 'SavingThrowRolled' ? save.payload.rolls : []).toHaveLength(2);
  });

  it('Magic Resistance: Advantage on the save a spell’s condition repeats', async () => {
    const world = await raiders((block) => ({ ...block, traits: { magicResistance: true } }));
    const sheet = (await world.state()).characterSheets.get(ELOWEN) as CharacterSheet;
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        abilities: { ...sheet.abilities, int: 16 },
        spellcasting: [
          ...sheet.spellcasting,
          { source: 'wizard', ability: 'int', spells: ['hold-person'] },
        ],
      },
    });
    world.roll(20, 1, 1);
    const held = await world.submit(
      {
        type: 'CastSpell',
        combatantId: ELOWEN,
        spellId: 'hold-person',
        using: { slotLevel: 2 },
        targetId: RAIDER_1,
      },
      PLAYER,
    );
    expect(codeOf(held)).toBe('accepted');
    await turnOf(world, RAIDER_1);
    world.roll(20, 1, 1);
    const end = await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    const save = (await recorded(world, end)).find((e) => e.type === 'SavingThrowRolled');
    // The raider's save at the end of its turn is against Hold Person: two d20s.
    expect(save?.payload).toMatchObject({ creatureId: RAIDER_1, purpose: 'spell', success: false });
    expect(save?.type === 'SavingThrowRolled' ? save.payload.rolls : []).toEqual([1, 1]);
    await verifyHistory(world);
  });
});

describe('legendary actions', () => {
  it('an attack off its own turn, once a round, back at the start of its turn', async () => {
    const world = await raiders((block) => ({
      ...block,
      legendary: {
        uses: 1,
        attacks: [block.attacks.find((one) => one.kind === 'melee')?.attackId ?? ''],
      },
    }));
    const attackId = await melee(world);
    const legendary = {
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId,
      targetId: ELOWEN,
      legendary: true,
    };
    // It is Elowen's turn: the raider's legendary attack comes after another's turn.
    const first = await world.dm(legendary);
    expect(codeOf(first)).toBe('accepted');
    expect(
      (await recorded(world, first)).find((e) => e.type === 'AttackPerformed')?.payload,
    ).toMatchObject({
      by: 'legendary',
    });
    expect(first.status === 'rejected' ? first.message : 'accepted').toBe('accepted');
    const second = await world.dm(legendary);
    expect(second.status === 'rejected' ? second.message : second.status).toBe('NO_USES_LEFT');
    // On its own turn it may not; its uses come back as that turn starts.
    await turnOf(world, RAIDER_1);
    const own = await world.dm(legendary);
    expect(own.status === 'rejected' ? own.message : own.status).toBe('NO_VALID_TRIGGER');
    const raider = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    expect(raider?.legendaryUsed).toBeUndefined();
    await verifyHistory(world);
  });
});
