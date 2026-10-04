import { questBookSchema, type CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import questBook from '../../../../fixtures/ravenford/quests.json' with { type: 'json' };
import { DM, ELOWEN, PLAYER } from '../authoring/testing/world.ts';
import { chronicleWorld, type ChronicleWorld } from '../chronicle/testing/world.ts';
import { SequentialIds, SteppingClock } from '../kernel/engine/deterministic-sources.ts';
import { WorldEngine } from '../kernel/engine/world-engine.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { questLog } from './projection.ts';

/**
 * Gate 05, G05-M01 (reviews/ASTRA_GATE_05_REPORT.md): an examination took
 * place where the evidence was when it was examined. A later move of the
 * evidence, at a later world time or later within the same one, never adds
 * or removes the party's "evidence examined" milestone. The quest follows
 * the effective history: undoing the examination removes it, undoing the
 * move changes nothing, and a restarted engine agrees.
 */
const QUESTS = questBookSchema.parse(questBook).quests;
const SYMBOL = 'strange-symbol';
const SITE = 'abandoned-caravan-site';

async function examinedAt(world: ChronicleWorld): Promise<string[]> {
  const snapshot = await world.snapshot();
  const [quest] = questLog(snapshot, holderPerspective(snapshot.state, { kind: 'PARTY' }), QUESTS);
  return (quest?.transitions ?? [])
    .filter((t) => t.stage === 'evidence-examined')
    .map((t) => t.sources[0]?.eventId ?? '');
}

async function restartedLog(world: ChronicleWorld) {
  const engine = new WorldEngine({
    store: world.store,
    ids: new SequentialIds(0x5c),
    clock: new SteppingClock(),
  });
  const snapshot = await engine.load('ravenford');
  if (!snapshot) throw new Error('missing campaign');
  return questLog(snapshot, holderPerspective(snapshot.state, { kind: 'PARTY' }), QUESTS);
}

async function currentLog(world: ChronicleWorld) {
  const snapshot = await world.snapshot();
  return questLog(snapshot, holderPerspective(snapshot.state, { kind: 'PARTY' }), QUESTS);
}

const inspect = (world: ChronicleWorld) =>
  world.as(PLAYER, {
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId: SYMBOL,
    method: 'inspect',
  });

const examinationEvent = async (world: ChronicleWorld, examined: CommandResult) =>
  (await world.snapshot()).history.find(
    (e) => e.type === 'EvidenceExamined' && e.causation.commandId === examined.commandId,
  )?.eventId;

describe('quest_examination_uses_location_when_examined', () => {
  it('keeps an examination at the site after the evidence is moved away, later or at once', async () => {
    for (const later of [true, false]) {
      const world = await chronicleWorld();
      await world.enter('old-trade-road');
      await world.enter(SITE);
      const examined = await inspect(world);
      const sourced = await examinationEvent(world, examined);
      expect(await examinedAt(world)).toEqual([sourced]);
      if (later) await world.dm({ type: 'AdvanceWorldTime', by: 3_600 });
      const moved = await world.as(DM, {
        type: 'PlaceEntity',
        entityId: SYMBOL,
        locationId: 'north-gate',
      });
      expect(moved.status).toBe('accepted');
      expect(await examinedAt(world), `later: ${String(later)}`).toEqual([sourced]);
      expect(await restartedLog(world)).toEqual(await currentLog(world));
      // Undoing the move changes nothing; undoing the examination takes the milestone away.
      expect((await world.undo(moved.commandId ?? '')).status).toBe('accepted');
      expect(await examinedAt(world)).toEqual([sourced]);
      expect((await world.undo(examined.commandId ?? '')).status).toBe('accepted');
      expect(await examinedAt(world)).toEqual([]);
      await world.verified();
    }
  });

  it('adds no examination at the site for evidence examined in town and moved there afterwards', async () => {
    for (const later of [true, false]) {
      const world = await chronicleWorld();
      await world.dm({ type: 'PlaceEntity', entityId: SYMBOL, locationId: 'market-square' });
      await inspect(world);
      if (later) await world.dm({ type: 'AdvanceWorldTime', by: 3_600 });
      const moved = await world.as(DM, { type: 'PlaceEntity', entityId: SYMBOL, locationId: SITE });
      expect(moved.status).toBe('accepted');
      expect(await examinedAt(world), `later: ${String(later)}`).toEqual([]);
      expect(await restartedLog(world)).toEqual(await currentLog(world));
      await world.verified();
    }
  });

  it('counts a member’s steps only from when they joined the party', async () => {
    const world = await chronicleWorld();
    // A scout reaches the caravan site before joining the party, then joins it.
    await world.dm({
      type: 'CreateEntity',
      entityId: 'g05-scout',
      kind: 'character',
      name: 'Scout',
      existsSince: null,
      placement: { locationId: SITE, since: null },
    });
    await world.dm({ type: 'AdvanceWorldTime', by: 3_600 });
    await world.dm({
      type: 'AssignCharacter',
      characterId: 'g05-scout',
      playerActorId: 'player-scout',
    });
    const reached = async () => {
      const [quest] = await currentLog(world);
      return (quest?.transitions ?? []).filter((t) => t.stage === 'site-reached');
    };
    expect(await reached()).toEqual([]);
    // Once a member, arriving there again counts.
    await world.dm({ type: 'PlaceEntity', entityId: 'g05-scout', locationId: 'old-trade-road' });
    await world.dm({ type: 'PlaceEntity', entityId: 'g05-scout', locationId: SITE });
    expect(await reached()).toHaveLength(1);
    await world.verified();
  });
});
