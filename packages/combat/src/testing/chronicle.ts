import type { CommandResult } from '@ltw/contracts';
import { chronicleEntries, templateProse, type ResolvedPerspective } from '@ltw/domain';

import type { HistoryFixture } from './history.ts';
import { CAMPAIGN, type RoadWorld } from './road.ts';

/**
 * Test support for chapters over earlier writers' histories (Gate 05): a
 * fixture's named steps, undo and its blockers, and a chapter the current
 * writer generates as the server does, with the template's prose.
 */
export const DM_PERSPECTIVE: ResolvedPerspective = {
  label: 'DM',
  kind: 'DM',
  holderId: null,
  scopes: 'ALL',
};

export const stepOf = (fixture: HistoryFixture) => (name: string) => {
  const commandId = fixture.labels[name];
  if (commandId === undefined) throw new Error(`no step ${name}`);
  return commandId;
};

export const undo = (world: RoadWorld, commandId: string) =>
  world.dm({ type: 'UndoCommand', targetCommandId: commandId });

export const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandId: string }[]).map((b) => b.commandId)
    : [];

export async function chapter(world: RoadWorld, perspective: ResolvedPerspective, label: string) {
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
