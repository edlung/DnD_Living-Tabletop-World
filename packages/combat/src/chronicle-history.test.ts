import type { CommandResult } from '@ltw/contracts';
import {
  chronicleEntries,
  checkWorldIntegrity,
  holderPerspective,
  replay,
  templateProse,
  writtenEarlier,
  type ResolvedPerspective,
} from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  eventFromRow,
  historicalWorld,
  loadHistory,
  type HistoryFixture,
} from './testing/history.ts';
import { CAMPAIGN, codeOf, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Gate 05, G05-H01, earlier-writer compatibility (kernel rules in
 * `packages/domain/src/kernel/AGENTS.md`). The Stages 170–180 writer
 * (revision e9c05ad, fixtures/history/e9c05ad-chronicle-names.json) recorded
 * chapters whose rests omit the names their entries and prose used. Their
 * `ChronicleGenerated` events carry version 2, now earlier: the current
 * reader loads and replays them, refuses any undo beneath them, recovers
 * when the DM undoes them newest first, and records complete rests from now on.
 */
const fixture: HistoryFixture = await loadHistory('e9c05ad-chronicle-names');
const step = (name: string) => {
  const commandId = fixture.labels[name];
  if (commandId === undefined) throw new Error(`no step ${name}`);
  return commandId;
};
const undo = (world: RoadWorld, commandId: string) =>
  world.dm({ type: 'UndoCommand', targetCommandId: commandId });
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string }[]).map((b) => b.commandId)
    : [];

async function chapter(world: RoadWorld, perspective: ResolvedPerspective, label: string) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  const { entries } = chronicleEntries(
    snapshot.state,
    snapshot.history,
    perspective,
    0,
    snapshot.state.clock,
  );
  return world.dm({
    type: 'GenerateChronicle',
    title: `Current writer (${label})`,
    perspective: perspective.label,
    from: 0,
    to: snapshot.state.clock,
    prose: {
      paragraphs: templateProse(entries),
      provider: 'template',
      model: 'chronicle-template-1',
      traceId: null,
    },
  });
}

describe('the Stages 170–180 writer’s chapters under the current reader', () => {
  it('parses and replays every prefix; its chapters were written earlier and tell the names of then', () => {
    const events = fixture.events.map(eventFromRow);
    expect(events).toHaveLength(fixture.stream.version);
    const chapters = events.filter((event) => event.type === 'ChronicleGenerated');
    expect(chapters.map((event) => event.causation.commandId)).toEqual([
      step('dm-chapter'),
      step('party-chapter'),
    ]);
    expect(chapters.every(writtenEarlier)).toBe(true);
    const dm = chapters[0];
    expect(JSON.stringify(dm?.type === 'ChronicleGenerated' ? dm.payload.entries : [])).toContain(
      'Elowen of the Trade Road went to The Old Market.',
    );
    // It rests on the placement it tells, not on the two names it used.
    const rests = dm?.type === 'ChronicleGenerated' ? dm.payload.rests : [];
    expect(rests).toContain('entity:elowen-starwhisper#placement');
    expect(rests).not.toContain('entity:elowen-starwhisper#profile');
    expect(rests).not.toContain('entity:market-square#profile');
    for (const row of fixture.commands) {
      expect(checkWorldIntegrity(replay(events.slice(0, row.last_sequence)))).toEqual([]);
    }
  });

  it('refuses every undo beneath its chapters, then recovers newest first', async () => {
    const world = await historicalWorld(fixture);
    for (const name of ['rename-elowen', 'rename-square', 'rename-mira']) {
      const refused = await undo(world, step(name));
      expect(codeOf(refused), name).toBe('UNDO_UNSAFE');
      expect(blockersOf(refused)).toContain(step('dm-chapter'));
    }
    await verifyHistory(world);
    for (const name of [
      'party-chapter',
      'dm-chapter',
      'rename-mira',
      'rename-square',
      'rename-elowen',
    ]) {
      expect(codeOf(await undo(world, step(name))), name).toBe('accepted');
    }
    expect((await world.state()).entities.get('elowen-starwhisper')?.name).toBe(
      'Elowen Starwhisper',
    );
    await verifyHistory(world);
  });

  it('records complete rests from now on: a new chapter protects the names it tells', async () => {
    const world = await historicalWorld(fixture);
    const renamed = await world.dm({
      type: 'UpdateEntityProfile',
      entityId: 'captain-thorne',
      name: 'The Gate Captain',
    });
    const state = await world.state();
    const told = await chapter(world, holderPerspective(state, { kind: 'PARTY' }), 'PARTY');
    expect(codeOf(told)).toBe('accepted');
    const dm = await chapter(
      world,
      { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' },
      'DM',
    );
    expect(codeOf(dm)).toBe('accepted');
    const recorded = (await world.store.loadStream(CAMPAIGN))?.events.filter(
      (event) => event.type === 'ChronicleGenerated' && !writtenEarlier(event),
    );
    expect(recorded).toHaveLength(2);
    expect(codeOf(await undo(world, renamed.commandId ?? ''))).toBe('UNDO_UNSAFE');
    await verifyHistory(world);
  });
});
