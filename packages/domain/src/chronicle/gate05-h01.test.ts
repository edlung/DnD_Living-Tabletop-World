import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, PLAYER } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { SequentialIds, SteppingClock } from '../kernel/engine/deterministic-sources.ts';
import { WorldEngine } from '../kernel/engine/world-engine.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { chronicleWorld, type ChronicleWorld } from './testing/world.ts';
import { chronicleChapters } from './views.ts';

/**
 * Gate 05, G05-H01 (reviews/ASTRA_GATE_05_REPORT.md): a chapter's entries
 * and prose use the names of what they tell, so a standing chapter rests on
 * those names as on everything else it tells. Undoing a rename beneath it is
 * refused, naming the chapter, until the DM undoes the chapter; the
 * re-decision oracle, replay, and integrity agree throughout, also after a
 * restart. Other names stay free.
 */
const NAME = 'G05 NAME THAT MUST NOT SURVIVE UNDO';

const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string; commandType: string }[])
    : [];

const rename = (world: ChronicleWorld, entityId: string, name = NAME) =>
  world.as(DM, { type: 'UpdateEntityProfile', entityId, name });

/** A fresh engine on the same store, as after a restart. */
async function restarted(world: ChronicleWorld) {
  const engine = new WorldEngine({
    store: world.store,
    ids: new SequentialIds(0x5b),
    clock: new SteppingClock(),
  });
  const snapshot = await engine.load('ravenford');
  if (!snapshot) throw new Error('missing campaign');
  return snapshot;
}

/** Undoing the rename is refused while the chapter stands; after the chapter is undone, it is not. */
async function protects(world: ChronicleWorld, renamed: CommandResult, chapter: CommandResult) {
  expect(codeOf(chapter)).toBe('accepted');
  const refused = await world.undo(renamed.commandId ?? '');
  expect(codeOf(refused)).toBe('UNDO_UNSAFE');
  expect(blockersOf(refused).map((b) => b.commandType)).toContain('GenerateChronicle');
  await world.verified();
  expect((await restarted(world)).state).toEqual(await world.state());
  // Explicit reverse recovery: the chapter first, then the rename.
  expect(codeOf(await world.undo(chapter.commandId ?? ''))).toBe('accepted');
  expect(codeOf(await world.undo(renamed.commandId ?? ''))).toBe('accepted');
  await world.verified();
}

describe('chronicle_protects_generated_name_dependencies', () => {
  it('protects a character’s name the DM chapter tells (Elowen went to the Market Square)', async () => {
    const world = await chronicleWorld();
    const renamed = await rename(world, ELOWEN);
    const chapter = await world.generate({ perspective: 'DM' });
    const [told] = chronicleChapters(await world.snapshot(), DM_VIEW);
    expect(JSON.stringify(told?.entries)).toContain(NAME);
    await protects(world, renamed, chapter);
  });

  it('protects a location’s name the DM chapter tells', async () => {
    const world = await chronicleWorld();
    const renamed = await rename(world, 'market-square');
    await protects(world, renamed, await world.generate({ perspective: 'DM' }));
  });

  it('protects the names of other told events: examinations, new NPCs, deaths, answers', async () => {
    const world = await chronicleWorld();
    await world.enter('old-trade-road');
    await world.enter('abandoned-caravan-site');
    await world.as(PLAYER, {
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'strange-symbol',
      method: 'inspect',
    });
    await world.dm({
      type: 'CreateEntity',
      entityId: 'g05-witness',
      kind: 'npc',
      name: 'Witness',
      existsSince: null,
      placement: { locationId: 'north-gate', since: null },
    });
    await world.dm({ type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' });
    // Mira tells Elowen about the caravan again: an answer naming both.
    await world.enter('market-square');
    await world.as(PLAYER, {
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: 'mira-vale',
      topicId: 'guild-caravan',
    });
    const named: [string, string][] = [
      ['strange-symbol', 'Examined'],
      ['g05-witness', 'Created'],
      ['orin-stonebeard', 'Dead'],
      ['mira-vale', 'Answering'],
    ];
    for (const [entityId, suffix] of named) {
      const renamed = await rename(world, entityId, `${NAME} ${suffix}`);
      const chapter = await world.generate({ perspective: 'DM' });
      // Every entry tells the name the entity has now, a new NPC's included.
      const told = chronicleChapters(await world.snapshot(), DM_VIEW).find(
        (c) => c.chronicleId === chapter.commandId,
      );
      expect(
        told?.entries.some((e) => e.text.includes(`${NAME} ${suffix}`)),
        entityId,
      ).toBe(true);
      await protects(world, renamed, chapter);
    }
  });

  it('protects the names the party chapter’s prose was rendered from, and only those', async () => {
    const world = await chronicleWorld();
    // Mira is a participant of the party's memories; Thorne is in none of them.
    const mira = await rename(world, 'mira-vale');
    const thorne = await rename(world, 'captain-thorne');
    const chapter = await world.generate({ perspective: 'PARTY' });
    expect(codeOf(await world.undo(thorne.commandId ?? ''))).toBe('accepted');
    await protects(world, mira, chapter);
  });

  it('protects the membership a character’s own chapter was told from', async () => {
    const world = await chronicleWorld();
    const snapshot = await world.snapshot();
    const label = holderPerspective(snapshot.state, {
      kind: 'CHARACTER',
      characterId: ELOWEN,
    }).label;
    const chapter = await world.generate({ perspective: label });
    expect(codeOf(chapter)).toBe('accepted');
    const recorded = (await world.snapshot()).history.find(
      (event) =>
        event.type === 'ChronicleGenerated' && event.causation.commandId === chapter.commandId,
    );
    const rests = recorded?.type === 'ChronicleGenerated' ? recorded.payload.rests : [];
    expect(rests).toEqual(
      expect.arrayContaining([`roster:character:${ELOWEN}`, `entity:${ELOWEN}`]),
    );
  });

  it('protects the party membership that put a member’s move in the chapter', async () => {
    const world = await chronicleWorld();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'g05-scout',
      kind: 'character',
      name: 'Scout',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    const joined = await world.as(DM, {
      type: 'AssignCharacter',
      characterId: 'g05-scout',
      playerActorId: 'player-scout',
    });
    await world.dm({ type: 'PlaceEntity', entityId: 'g05-scout', locationId: 'north-gate' });
    const chapter = await world.generate({ perspective: 'DM' });
    const told = chronicleChapters(await world.snapshot(), DM_VIEW).find(
      (c) => c.chronicleId === chapter.commandId,
    );
    expect(told?.entries.some((e) => e.text === 'Scout went to North Gate.')).toBe(true);
    const refused = await world.undo(joined.commandId ?? '');
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused).map((b) => b.commandType)).toContain('GenerateChronicle');
    await world.verified();
  });
});
