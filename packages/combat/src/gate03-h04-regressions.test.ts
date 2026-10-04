import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { cast } from './testing/reactions.ts';
import {
  AMBUSH,
  ELOWEN,
  RAIDER_2,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * G03-H04 (reviews/ASTRA_GATE_03_RETEST_1.md):
 * `outside_encounter_cast_retains_target_premises_during_another_fight`.
 * A spell's premises follow whether its caster takes part in the encounter,
 * never whether some encounter exists: with no fight, or with a fight the
 * caster is not in, the target's existence, status, and placement and the
 * caster's own placement block undo while the cast stands.
 */
type Start = typeof AMBUSH.startCombat;
type Fight = 'no fight' | 'a fight without the caster';
type Premise = 'creation' | 'revival' | 'placement' | 'caster placement';
const BYSTANDER = 'r1-bystander';

const undo = (world: RoadWorld, result: CommandResult) =>
  world.dm({ type: 'UndoCommand', targetCommandId: result.commandId ?? '' });
const accepted = async (sent: Promise<CommandResult>) => {
  const result = await sent;
  expect(result.status, JSON.stringify(result)).toBe('accepted');
  return result;
};

/** Elowen stands on the road (placed with everyone) but is not a combatant. */
const startWithoutElowen = (world: RoadWorld) =>
  startAmbush(world, [3, 2, 1, 15], (command: Start) => ({
    ...command,
    combatants: command.combatants.filter((c) => c.entityId !== ELOWEN),
  }));

/** The world, and the command whose undo the spell must block. */
async function arrange(fight: Fight, premise: Premise) {
  const world = await roadWorld();
  if (fight === 'a fight without the caster') await startWithoutElowen(world);
  const here = (await world.state()).entities.get(ELOWEN)?.placement?.locationId ?? '';
  const there = premise === 'caster placement' ? 'golden-stag-inn' : here;
  const npc = (placed: boolean) =>
    world.dm({
      type: 'CreateEntity',
      entityId: BYSTANDER,
      kind: 'npc',
      name: 'Bystander',
      existsSince: null,
      ...(placed ? { placement: { locationId: there, since: null } } : {}),
    });
  switch (premise) {
    case 'creation':
      return { world, premise: await accepted(npc(true)) };
    case 'revival': {
      await accepted(npc(true));
      await accepted(world.dm({ type: 'ChangeEntityStatus', entityId: BYSTANDER, status: 'dead' }));
      const revived = world.dm({
        type: 'ChangeEntityStatus',
        entityId: BYSTANDER,
        status: 'active',
      });
      return { world, premise: await accepted(revived) };
    }
    case 'placement': {
      await accepted(npc(false));
      const placed = world.dm({ type: 'PlaceEntity', entityId: BYSTANDER, locationId: there });
      return { world, premise: await accepted(placed) };
    }
    case 'caster placement': {
      await accepted(npc(true));
      const moved = world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId: there });
      return { world, premise: await accepted(moved) };
    }
  }
}

describe('G03-H04 outside_encounter_cast_retains_target_premises_during_another_fight', () => {
  const fights: Fight[] = ['no fight', 'a fight without the caster'];
  const spells = ['hunters-mark', 'healing-word'];
  const premises: Premise[] = ['creation', 'revival', 'placement', 'caster placement'];
  const cases = fights.flatMap((fight) =>
    spells.flatMap((spell) => premises.map((premise) => [fight, spell, premise] as const)),
  );

  it.each(cases)('%s: %s blocks undoing the target’s %s', async (fight, spell, premise) => {
    const arranged = await arrange(fight, premise);
    const { world } = arranged;
    const spellCast = await accepted(world.submit(cast(ELOWEN, spell, { targetId: BYSTANDER })));
    const version = (await world.state()).version;
    const refused = await undo(world, arranged.premise);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(
      refused.status === 'rejected' &&
        (refused.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId),
    ).toContain(spellCast.commandId);
    expect((await world.state()).version).toBe(version);
    await verifyHistory(world);
    // Explicit reverse order recovers.
    expect(codeOf(await undo(world, spellCast))).toBe('accepted');
    expect(codeOf(await undo(world, arranged.premise))).toBe('accepted');
    await verifyHistory(world);
  });

  it.each(spells)(
    'the caster in the fight: %s blocks undoing its target’s revival',
    async (spell) => {
      const world = await roadWorld();
      await startAmbush(world);
      await accepted(world.dm({ type: 'ChangeEntityStatus', entityId: RAIDER_2, status: 'dead' }));
      const revived = await accepted(
        world.dm({ type: 'ChangeEntityStatus', entityId: RAIDER_2, status: 'active' }),
      );
      const spellCast = await accepted(world.submit(cast(ELOWEN, spell, { targetId: RAIDER_2 })));
      const refused = await undo(world, revived);
      expect(codeOf(refused)).toBe('UNDO_UNSAFE');
      expect(
        refused.status === 'rejected' &&
          (refused.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId),
      ).toContain(spellCast.commandId);
      await verifyHistory(world);
    },
  );

  /** Everyone on the road, magic on the Shaman and a bystander; a fight without Elowen, or none. */
  async function roadside(fight: Fight) {
    const world = await roadWorld();
    if (fight === 'a fight without the caster') await startWithoutElowen(world);
    else for (const place of AMBUSH.place) await accepted(world.dm(place));
    await accepted(
      world.dm({
        type: 'CreateEntity',
        entityId: BYSTANDER,
        kind: 'npc',
        name: 'Bystander',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      }),
    );
    for (const entityId of [SHAMAN, BYSTANDER]) {
      const clue = { clueId: `magic-${entityId}`, entityId, method: 'magic', subjects: [] };
      await accepted(world.dm({ type: 'AddClue', ...clue, statement: `Magic on ${entityId}.` }));
    }
    return world;
  }

  it.each([...spells, 'detect-magic'])(
    'a fight the caster is not in changes nothing about %s: same premises, same result',
    async (spell) => {
      const castOn = async (fight: Fight) => {
        const world = await roadside(fight);
        const target = spell === 'detect-magic' ? {} : { targetId: BYSTANDER };
        const result = await accepted(world.submit(cast(ELOWEN, spell, target)));
        const events = await recorded(world, result);
        return {
          premises: events.flatMap((e) =>
            e.type === 'PremisesRecorded' ? e.payload.premises : [],
          ),
          revealed: events.flatMap((e) =>
            e.type === 'EvidenceExamined' ? e.payload.revealed.map((r) => r.clueId) : [],
          ),
        };
      };
      const busy = await castOn('a fight without the caster');
      expect(busy).toEqual(await castOn('no fight'));
      // Outside the fight Detect Magic senses the room, not 30 ft of a square it lacks.
      if (spell === 'detect-magic') expect(busy.revealed).toContain(`magic-${SHAMAN}`);
    },
  );
});

describe('found by the randomized suite: Detect Magic read every magic clue', () => {
  it('a clue it passed over, out of reach, cannot be taken back beneath it', async () => {
    const world = await roadWorld();
    await accepted(
      world.dm({
        type: 'CreateEntity',
        entityId: 'far-charm',
        kind: 'item',
        name: 'Far Charm',
        existsSince: null,
        placement: { locationId: 'north-gate', since: null },
      }),
    );
    const clue = await accepted(
      world.dm({
        type: 'AddClue',
        entityId: 'far-charm',
        method: 'magic',
        statement: 'A charm hums far away.',
        subjects: [],
      }),
    );
    const detect = await accepted(world.submit(cast(ELOWEN, 'detect-magic')));
    expect(detect.status === 'accepted' && detect.outcome).toMatchObject({ discovered: [] });
    const refused = await undo(world, clue);
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(
      refused.status === 'rejected' &&
        (refused.details?.['blockers'] as { commandId: string }[]).map((b) => b.commandId),
    ).toEqual([detect.commandId]);
    await verifyHistory(world);
    expect(codeOf(await undo(world, detect))).toBe('accepted');
    expect(codeOf(await undo(world, clue))).toBe('accepted');
    await verifyHistory(world);
  });
});
