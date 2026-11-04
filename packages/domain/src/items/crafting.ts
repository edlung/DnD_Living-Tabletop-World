import {
  entityIdSchema,
  itemCatalogIdSchema,
  MAX_CRAFT_HELPERS,
  MAX_CRAFT_PROJECTS,
} from '@ltw/contracts';
import { z } from 'zod';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { KernelEventOf, RecordedEvent, Restore } from '../kernel/events.ts';
import { entityChecked, facts } from '../kernel/fact-keys.ts';
import type { Footprint } from '../kernel/facts.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * A crafting project (docs/adr/0057-encounters-maps-loot.md §9), a world fact: who makes it and
 * who helps, what it makes and how many, the tool it is made with (none for a scroll scribed by
 * Arcana), and its hours of work needed and done. The materials were paid as it began; the made
 * thing appears in the crafter's pack when the hours are done.
 */
const record = z
  .object({
    crafterId: entityIdSchema,
    helperIds: z.array(entityIdSchema).max(MAX_CRAFT_HELPERS),
    catalogId: itemCatalogIdSchema,
    quantity: z.number().int().min(1).max(99),
    /** A Spell Scroll's spell (an SRD id); null for a thing from the catalog. */
    spellId: z.string().min(1).max(64).nullable(),
    /** What it makes, in the campaign's language. */
    name: z.string().min(1).max(120),
    toolId: itemCatalogIdSchema.nullable(),
    materialsCp: z.number().int().min(0),
    hoursNeeded: z.number().int().min(1).max(100_000),
    hoursDone: z.number().int().min(0).max(100_000),
  })
  .strict();
export type CraftProject = z.infer<typeof record>;

/** The things the DM's downtime may finish at once: one a project. */
export const DOWNTIME_IDS = MAX_CRAFT_PROJECTS;

export const craftingStartedPayloadSchema = z
  .object({ projectId: entityIdSchema, project: record })
  .strict();
export const craftingWorkedPayloadSchema = z
  .object({ projectId: entityIdSchema, hoursDone: z.number().int().min(1).max(100_000) })
  .strict();
/** The made thing's item: created and granted beside it. */
export const craftingFinishedPayloadSchema = z
  .object({ projectId: entityIdSchema, itemId: entityIdSchema })
  .strict();
export const craftingAbandonedPayloadSchema = z.object({ projectId: entityIdSchema }).strict();

export const craftingRestoreSchemas = [
  z
    .object({ fact: z.literal('crafting'), projectId: entityIdSchema, value: record.nullable() })
    .strict(),
] as const;

export type CraftingEventType =
  'CraftingStarted' | 'CraftingWorked' | 'CraftingFinished' | 'CraftingAbandoned';
type Ev<T extends CraftingEventType> = Extract<RecordedEvent, { type: T }>;

/** Whether a character works on a project, its own or as a helper. */
export const crafting = (state: WorldState, characterId: string): boolean =>
  [...state.crafting.values()].some(
    (project) => project.crafterId === characterId || project.helperIds.includes(characterId),
  );

const mustRun = (state: WorldState, projectId: string): CraftProject => {
  const project = state.crafting.get(projectId);
  if (!project) throw new CorruptHistoryError(`no project ${projectId}`);
  return project;
};

export function applyCraftingEvent(state: WorldState, event: Ev<CraftingEventType>): WorldState {
  const { projectId } = event.payload;
  const put = (project: CraftProject) => ({
    ...state,
    crafting: withEntry(state.crafting, projectId, project),
  });
  const gone = () => ({ ...state, crafting: withoutEntry(state.crafting, projectId) });
  switch (event.type) {
    case 'CraftingStarted': {
      const { project } = event.payload;
      if (state.crafting.has(projectId))
        throw new CorruptHistoryError(`project ${projectId} again`);
      if (state.entities.get(project.crafterId)?.kind !== 'character')
        throw new CorruptHistoryError(`project ${projectId} has no crafter`);
      return put(project);
    }
    case 'CraftingWorked': {
      const project = mustRun(state, projectId);
      if (event.payload.hoursDone <= project.hoursDone)
        throw new CorruptHistoryError(`project ${projectId} worked backwards`);
      return put({ ...project, hoursDone: event.payload.hoursDone });
    }
    case 'CraftingFinished':
      if (mustRun(state, projectId).hoursDone < mustRun(state, projectId).hoursNeeded)
        throw new CorruptHistoryError(`project ${projectId} finished early`);
      return gone();
    case 'CraftingAbandoned':
      mustRun(state, projectId);
      return gone();
  }
}

export function applyCraftingRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'crafting' }>,
): WorldState {
  return {
    ...state,
    crafting:
      restore.value === null
        ? withoutEntry(state.crafting, restore.projectId)
        : withEntry(state.crafting, restore.projectId, restore.value),
  };
}

/** A project's facts: begun on its workers, then worked, finished or given up on its own record. */
export function craftingFootprint(event: KernelEventOf<CraftingEventType>): Footprint {
  const project = facts.crafting(event.payload.projectId);
  if (event.type !== 'CraftingStarted') return { reads: [project], writes: [project] };
  const { crafterId, helperIds } = event.payload.project;
  return {
    reads: [facts.clock(), ...[crafterId, ...helperIds].flatMap(entityChecked), project],
    writes: [project],
  };
}
