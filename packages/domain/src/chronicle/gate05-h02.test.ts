import type { ChronicleSourceView, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN, DM, ELOWEN, PLAYER } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { SequentialIds, SteppingClock } from '../kernel/engine/deterministic-sources.ts';
import { WorldEngine } from '../kernel/engine/world-engine.ts';
import { facts } from '../kernel/fact-keys.ts';
import { footprintOf } from '../kernel/facts.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { DM_VIEW } from '../visual/testing/world.ts';
import { chronicleWorld, type ChronicleWorld } from './testing/world.ts';
import { chronicleChapters } from './views.ts';

/**
 * Gate 05 retest 1, G05-H02 (reviews/ASTRA_GATE_05_RETEST_1.md): a chapter
 * rests on every occurrence it tells, whatever that occurrence changed. An
 * inspection that rolled nothing and found nothing new writes no fact; while
 * a chapter tells it, undoing it is refused, naming the chapter, and nothing
 * changes, also after a restart, until the DM undoes the chapter first. An
 * examination no standing chapter tells stays undoable. Every source a
 * standing chapter resolves stays resolved.
 */
const SITE = 'location-f3b82c8b';
const SYMBOL = 'feature-19c7c7f7';
const TOKEN = 'g05-plain-token';

const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string; commandType: string }[])
    : [];

const inspect = (world: ChronicleWorld, entityId: string) =>
  world.as(PLAYER, { type: 'ExamineEntity', characterId: ELOWEN, entityId, method: 'inspect' });

/** An item at the caravan site with no clue to find. */
const placeToken = (world: ChronicleWorld) =>
  world.dm({
    type: 'CreateEntity',
    entityId: TOKEN,
    kind: 'item',
    name: 'Plain Token',
    existsSince: null,
    placement: { locationId: SITE, since: null },
  });

/** An accepted examination that rolled nothing, found nothing, and wrote no fact. */
async function writesNothing(world: ChronicleWorld, result: CommandResult): Promise<string> {
  expect(codeOf(result)).toBe('accepted');
  const commandId = result.commandId ?? '';
  const { history } = await world.snapshot();
  const events = history.filter((event) => event.causation.commandId === commandId);
  expect(events.map((event) => event.type)).toEqual(['PremisesRecorded', 'EvidenceExamined']);
  expect(events.flatMap((event) => footprintOf(event).writes)).toEqual([]);
  return commandId;
}

/** Elowen at the caravan site, then the examination the review reproduced in each mode. */
async function emptyExamination(world: ChronicleWorld, mode: string): Promise<string> {
  await world.enter('old-trade-road');
  await world.enter(SITE);
  if (mode === 'repeated inspection') {
    expect(codeOf(await inspect(world, SYMBOL))).toBe('accepted');
    return writesNothing(world, await inspect(world, SYMBOL));
  }
  await placeToken(world);
  return writesNothing(world, await inspect(world, TOKEN));
}

/** The sources the DM reads for the entry of `chapterId` that tells `commandId`. */
async function sourcesTelling(
  world: ChronicleWorld,
  chapterId: string,
  commandId: string,
): Promise<readonly ChronicleSourceView[]> {
  const snapshot = await world.snapshot();
  const entry = snapshot.state.chronicles
    .get(chapterId)
    ?.entries.find((told) => told.source.kind === 'event' && told.source.commandId === commandId);
  if (!entry) throw new Error(`${chapterId} does not tell ${commandId}`);
  const chapter = chronicleChapters(snapshot, DM_VIEW).find((c) => c.chronicleId === chapterId);
  return chapter?.entries.find((viewed) => viewed.key === entry.key)?.sources ?? [];
}

/** A fresh engine on the same store, as after a restart. */
const restarted = (world: ChronicleWorld) =>
  new WorldEngine({ store: world.store, ids: new SequentialIds(0x5c), clock: new SteppingClock() });

describe('chronicle_protects_cited_occurrences_without_fact_writes', () => {
  it.each(['repeated inspection', 'first inspection without clues'])(
    'refuses to undo a %s a standing chapter tells, until the chapter is undone',
    async (mode) => {
      const world = await chronicleWorld();
      const examination = await emptyExamination(world, mode);
      const chapter = await world.generate({ perspective: 'DM' });
      expect(codeOf(chapter)).toBe('accepted');
      const chapterId = chapter.commandId ?? '';
      const sources = await sourcesTelling(world, chapterId, examination);
      expect(sources).toEqual([expect.objectContaining({ eventType: 'EvidenceExamined' })]);
      await world.verified();

      const before = await world.snapshot();
      const refused = await world.undo(examination);
      expect(codeOf(refused)).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toEqual([
        expect.objectContaining({ commandId: chapterId, commandType: 'GenerateChronicle' }),
      ]);
      // Nothing changed: no compensation, the examination stands, its entry keeps its source.
      expect(await world.snapshot()).toEqual(before);
      expect(await sourcesTelling(world, chapterId, examination)).toEqual(sources);
      await world.verified();

      // After a restart, the stored history refuses it the same way.
      const engine = restarted(world);
      expect((await engine.load(CAMPAIGN))?.state).toEqual(before.state);
      const again = await engine.execute({
        commandId: 'g05-h02.after-restart',
        campaignId: CAMPAIGN,
        actor: DM,
        command: { type: 'UndoCommand', targetCommandId: examination },
      });
      expect(codeOf(again)).toBe('UNDO_UNSAFE');
      expect(blockersOf(again).map((blocker) => blocker.commandId)).toEqual([chapterId]);
      expect(await world.snapshot()).toEqual(before);

      // Explicit reverse recovery: the chapter, then the examination.
      expect(codeOf(await world.undo(chapterId))).toBe('accepted');
      expect(codeOf(await world.undo(examination))).toBe('accepted');
      await world.verified();
    },
  );

  it('leaves an examination that changed nothing undoable while no standing chapter tells it', async () => {
    const world = await chronicleWorld();
    const examination = await emptyExamination(world, 'repeated inspection');
    const examinedAt = (await world.state()).clock;
    await world.dm({ type: 'AdvanceWorldTime', by: 3_600 });
    await world.enter('old-trade-road');
    // A DM chapter whose window starts after it, and a chapter told from memories only.
    const later = await world.generate({ perspective: 'DM', from: examinedAt + 1 });
    expect(codeOf(later)).toBe('accepted');
    expect(codeOf(await world.generate({ perspective: 'PARTY' }))).toBe('accepted');
    expect(codeOf(await world.undo(examination))).toBe('accepted');
    await world.verified();
  });

  it.each(['DM', 'PARTY', `CHARACTER:${ELOWEN}`])(
    'protects every source a standing %s chapter resolves',
    async (perspective) => {
      const world = await chronicleWorld();
      await emptyExamination(world, 'repeated inspection');
      await placeToken(world);
      await writesNothing(world, await inspect(world, TOKEN));
      const chapter = await world.generate({ perspective });
      expect(codeOf(chapter)).toBe('accepted');
      const chapterId = chapter.commandId ?? '';
      const before = await world.snapshot();
      // The recorded rests hold the standing of every command an entry tells (version 4).
      const record = before.state.chronicles.get(chapterId);
      for (const { source } of record?.entries ?? []) {
        if (source.kind === 'event')
          expect(record?.rests).toContain(facts.command(source.commandId));
      }
      const told = chronicleChapters(before, DM_VIEW).find((c) => c.chronicleId === chapterId);
      const sources = told?.entries.flatMap((entry) => entry.sources) ?? [];
      expect(sources.length).toBeGreaterThan(0);
      const commands = new Set(
        sources.map(
          ({ eventId }) =>
            before.history.find((event) => event.eventId === eventId)?.causation.commandId ?? '',
        ),
      );
      for (const commandId of commands) {
        const refused = await world.undo(commandId);
        if (codeOf(refused) === 'UNDO_NOT_SUPPORTED') continue;
        expect(codeOf(refused), commandId).toBe('UNDO_UNSAFE');
        expect(
          blockersOf(refused).map((blocker) => blocker.commandId),
          commandId,
        ).toContain(chapterId);
      }
      expect(await world.snapshot()).toEqual(before);
      await world.verified();
    },
  );
});

describe('chapters keep every source under random examinations and undos', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 104_729);
      const pick = <T>(items: readonly T[]): T | undefined =>
        items.length === 0 ? undefined : items[Math.floor(rng() * items.length)];
      const world = await chronicleWorld();
      await world.enter('old-trade-road');
      await world.enter(SITE);
      await placeToken(world);
      const accepted: string[] = [];
      const resolved = new Map<string, readonly ChronicleSourceView[]>();
      for (let step = 0; step < 24; step += 1) {
        const roll = rng();
        if (roll < 0.4) {
          const result = await inspect(world, pick([SYMBOL, TOKEN]) ?? TOKEN);
          if (result.status === 'accepted') accepted.push(result.commandId);
        } else if (roll < 0.6) {
          const result = await world.generate({ perspective: pick(['DM', 'PARTY']) ?? 'DM' });
          if (result.status === 'accepted') accepted.push(result.commandId);
        } else if (roll < 0.7) {
          await world.dm({ type: 'AdvanceWorldTime', by: 600 });
        } else {
          const target = pick(accepted.slice(-6));
          if (target) await world.undo(target);
        }
        // Every entry of every standing chapter resolves exactly what it resolved when told.
        for (const chapter of chronicleChapters(await world.snapshot(), DM_VIEW)) {
          for (const entry of chapter.entries) {
            const key = `${chapter.chronicleId}/${entry.key}`;
            const first = resolved.get(key) ?? entry.sources;
            resolved.set(key, first);
            expect(entry.sources, `step ${String(step)}: ${key}`).toEqual(first);
            expect(entry.sources.length, key).toBeGreaterThan(0);
          }
        }
      }
      await world.verified();
    },
    60_000,
  );
});
