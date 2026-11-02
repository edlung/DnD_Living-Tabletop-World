import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { suggestMonsterTurn } from './suggestion.ts';

/**
 * A creature a player commands (docs/adr/0044-online-play.md §7): the DM hands a creature in the
 * fight to a party character; that character's player runs its turn through the World Engine, as
 * its commander, and nobody else's creature; the DM takes it back.
 */
const WORG = 'creature-77c0f1a2';

/** The ambush with a grey worg on the party's side at initiative 12: after the Shaman. */
async function withWorg(): Promise<RoadWorld> {
  const world = await roadWorld();
  await startAmbush(world);
  const block = (await world.state()).statBlocks.get(RAIDER_1);
  await world.dm({
    type: 'CreateEntity',
    entityId: WORG,
    kind: 'creature',
    name: 'Grey Worg',
    existsSince: null,
    placement: { locationId: 'old-trade-road', since: null },
  });
  await world.dm({ type: 'SetStatBlock', entityId: WORG, statBlock: block });
  const added = await world.dm({
    type: 'AddCombatant',
    entityId: WORG,
    side: 'party',
    position: { x: 9, y: 5 },
    initiative: 12,
  });
  expect(codeOf(added)).toBe('accepted');
  return world;
}

/** Elowen's turn, then the Shaman's, pass: the worg's turn comes. */
async function toWorg(world: RoadWorld): Promise<void> {
  expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER))).toBe(
    'accepted',
  );
  expect(codeOf(await world.dm({ type: 'EndTurn', combatantId: SHAMAN }))).toBe('accepted');
  const encounter = await world.encounter();
  expect(encounter.combatants[encounter.currentIndex]?.entityId).toBe(WORG);
}

describe('a creature a player commands', () => {
  it('is the DM’s to hand to a party character in the fight, and to take back', async () => {
    const world = await withWorg();
    const hand = (combatantId: string, characterId: string | null) =>
      world.dm({ type: 'CommandCreature', combatantId, characterId });
    expect(codeOf(await hand(ELOWEN, ELOWEN))).toBe('INVALID_COMMAND');
    expect(codeOf(await hand('mira-vale', ELOWEN))).toBe('NOT_A_COMBATANT');
    expect(codeOf(await hand(WORG, 'maren-ashby'))).toBe('INVALID_COMMAND');
    const handed = await hand(WORG, ELOWEN);
    expect(codeOf(handed)).toBe('accepted');
    expect((await recorded(world, handed)).map((event) => event.type)).toEqual([
      'CombatantUpdated',
    ]);
    expect((await world.encounter()).combatants.find((c) => c.entityId === WORG)?.commandedBy).toBe(
      ELOWEN,
    );
    expect(codeOf(await hand(WORG, ELOWEN))).toBe('NO_EFFECT');
    // A player hands nothing.
    expect(
      codeOf(
        await world.submit(
          { type: 'CommandCreature', combatantId: WORG, characterId: null },
          PLAYER,
        ),
      ),
    ).toBe('FORBIDDEN');
  });

  it('lets the commander’s player run its turn, recorded as its commander, and no other', async () => {
    const world = await withWorg();
    await toWorg(world);
    // Not yet commanded: the player may not end its turn.
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: WORG }, PLAYER))).toBe(
      'FORBIDDEN',
    );
    await world.dm({ type: 'CommandCreature', combatantId: WORG, characterId: ELOWEN });
    const ended = await world.submit({ type: 'EndTurn', combatantId: WORG }, PLAYER);
    expect(codeOf(ended)).toBe('accepted');
    const premises = (await recorded(world, ended)).flatMap((event) =>
      event.type === 'PremisesRecorded' ? event.payload.premises : [],
    );
    expect(premises).toContainEqual({
      kind: 'commander',
      characterId: ELOWEN,
      playerActorId: PLAYER.actorId,
    });
    // A raider is nobody's to command.
    const encounter = await world.encounter();
    expect(encounter.combatants[encounter.currentIndex]?.entityId).toBe(RAIDER_1);
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: RAIDER_1 }, PLAYER))).toBe(
      'FORBIDDEN',
    );
  });

  it('suggests a commanded creature’s act against the party’s foes, never the party', async () => {
    const world = await withWorg();
    // The Shaman, charmed: Elowen's player runs it.
    await world.dm({ type: 'CommandCreature', combatantId: SHAMAN, characterId: ELOWEN });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    const suggestion = suggestMonsterTurn(await world.state());
    expect(suggestion?.combatantId).toBe(SHAMAN);
    const command = suggestion?.command;
    const target =
      command?.type === 'Attack'
        ? command.targetId
        : command?.type === 'CastSpell'
          ? (command.targetId ?? null)
          : null;
    const party = new Set([ELOWEN, 'brann-ironvale', 'maren-ashby', 'tamsin-quickfoot', WORG]);
    expect(target === null || !party.has(target)).toBe(true);
  });
});
