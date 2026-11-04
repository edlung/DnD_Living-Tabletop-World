import {
  COINAGES,
  ITEM_CATALOG,
  SCRIBING_TOOL,
  craftCost,
  type EntityRef,
  type ItemEntry,
} from '@ltw/contracts';
import { SRD_ITEM_CATALOG } from '@ltw/contracts/srd-items';

import { campaignOptions } from '../campaign/options.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef, knownEntityIds } from '../knowledge/projection.ts';
import { craftOf } from './catalog.ts';
import { crafting, type CraftProject } from './crafting.ts';
import { homeCoinage, purseCp } from './purse.ts';
import { carriedBy, isPartyCharacter, possessionOf } from './records.ts';

/**
 * Crafting as a viewer sees it (docs/adr/0057-encounters-maps-loot.md §9): the DM every project;
 * a character its own and those it helps, what it can make now — the things whose tool it carries
 * and is proficient with — the spells it has prepared and could scribe, who here that it knows could
 * help with which tool, and the worth of its coins. The server words the names; null for anyone
 * else.
 */
export interface CraftingView {
  readonly projects: readonly {
    readonly projectId: string;
    readonly project: CraftProject;
    readonly crafter: EntityRef;
    readonly helpers: readonly EntityRef[];
  }[];
  readonly recipes: readonly {
    readonly entry: ItemEntry;
    readonly toolId: string;
    readonly days: number;
    readonly materialsCp: number;
  }[];
  /** The spells it has prepared, when it may scribe at all (Arcana, or the supplies at hand). */
  readonly scribable: readonly string[];
  readonly helpers: readonly {
    readonly entity: EntityRef;
    readonly toolIds: readonly string[];
    /** On a project already. */
    readonly busy: boolean;
  }[];
  readonly maxHelpers: number;
  readonly busy: boolean;
  readonly purseCp: number;
  readonly coinage: number;
}

const CRAFTED = [...ITEM_CATALOG, ...SRD_ITEM_CATALOG].flatMap((entry) => {
  const craft = craftOf(entry);
  return craft ? [{ entry, craft }] : [];
});

const holds = (state: WorldState, holderId: string, catalogId: string) =>
  carriedBy(state, holderId).some(
    (itemId) =>
      possessionOf(state, itemId)?.catalogId === catalogId &&
      state.entities.get(itemId)?.status === 'active',
  );

export function craftingView(
  state: WorldState,
  perspective: ResolvedPerspective,
): CraftingView | null {
  const dm = perspective.kind === 'DM';
  const viewerId = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
  if (!dm && viewerId === null) return null;
  const projects = [...state.crafting]
    .filter(
      ([, project]) =>
        dm || project.crafterId === viewerId || project.helperIds.includes(viewerId ?? ''),
    )
    .map(([projectId, project]) => ({
      projectId,
      project,
      crafter: entityRef(state, project.crafterId),
      helpers: project.helperIds.map((id) => entityRef(state, id)),
    }));
  const empty = {
    projects,
    recipes: [],
    scribable: [],
    helpers: [],
    maxHelpers: campaignOptions(state).craftingHelpers ?? 1,
    busy: false,
    purseCp: 0,
    coinage: 0,
  };
  if (viewerId === null) return empty;
  const sheet = state.characterSheets.get(viewerId);
  const tools = sheet?.tools ?? [];
  const recipes = CRAFTED.flatMap(({ entry, craft }) => {
    const toolId = craft.tools.find((one) => tools.includes(one) && holds(state, viewerId, one));
    return toolId === undefined ? [] : [{ entry, toolId, ...craftCost(entry.valueCp, 1, craft) }];
  });
  const scribes =
    sheet !== undefined &&
    (sheet.skills.proficient.includes('arcana') ||
      (tools.includes(SCRIBING_TOOL) && holds(state, viewerId, SCRIBING_TOOL)));
  const here = state.entities.get(viewerId)?.placement?.locationId;
  const known = knownEntityIds(state, perspective);
  const helpers = [...state.entities.values()].flatMap((entity) => {
    if (
      entity.entityId === viewerId ||
      !known.has(entity.entityId) ||
      !isPartyCharacter(state, entity.entityId) ||
      entity.status !== 'active' ||
      here === undefined ||
      entity.placement?.locationId !== here
    )
      return [];
    const toolIds = state.characterSheets.get(entity.entityId)?.tools ?? [];
    return [
      {
        entity: entityRef(state, entity.entityId),
        toolIds: [...toolIds],
        busy: crafting(state, entity.entityId),
      },
    ];
  });
  return {
    ...empty,
    recipes,
    scribable: scribes ? [...new Set(sheet.spellcasting.flatMap((source) => source.spells))] : [],
    helpers,
    busy: crafting(state, viewerId),
    purseCp: purseCp(state, viewerId),
    coinage: Math.max(0, COINAGES.indexOf(homeCoinage(state, viewerId))),
  };
}
