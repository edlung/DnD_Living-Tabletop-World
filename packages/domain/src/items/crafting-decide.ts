import {
  CRAFT_DAY_HOURS,
  MAX_CRAFT_PROJECTS,
  SCRIBING_TOOL,
  SPELL_SCROLL_COSTS,
  craftCost,
  scrollCatalogId,
  type CharacterSheet,
  type ItemEntry,
} from '@ltw/contracts';

import { campaignOptions } from '../campaign/options.ts';
import { isCombatant } from '../combat/records.ts';
import { accept, reject, type Decision, type DecisionContext } from '../kernel/decision.ts';
import type { ResolvedCommandOf } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { craftOf, itemEntry } from './catalog.ts';
import { crafting, type CraftProject } from './crafting.ts';
import { mayHandle, played } from './handling.ts';
import { spendCoins } from './purse.ts';
import { carriedBy, isPartyCharacter, possessionOf } from './records.ts';

/**
 * Crafting decided (docs/adr/0057-encounters-maps-loot.md §9; SRD 5.2.1 "Crafting Nonmagical
 * Items", "Brewing Potions of Healing", "Scribing Spell Scrolls"). A character outside a fight, on
 * no other project, begins one: a thing its catalog entry says a tool makes, with that tool at hand
 * and proficiency in it — its helpers here, proficient too, as many as the campaign allows — or a
 * Spell Scroll of a spell it has prepared, by Arcana or Calligrapher's Supplies. The materials are
 * paid from its coins at once, the change made. The DM's downtime works every project a number of
 * days, eight hours of each worker a day; a scroll's day counts only while its spell is prepared.
 * A project done puts the made thing in the crafter's pack.
 */
const language = (state: WorldState) => (state.campaign?.language === 'ru' ? 'ru' : 'en');

/** An entry's name and line in the campaign's language: the rules' words (an SRD entry's Russian). */
const wordsOf = (context: DecisionContext, entry: ItemEntry) => {
  const lang = language(context.state);
  return (
    context.characters?.itemWords?.(entry.itemId, lang) ?? {
      name: entry.name[lang],
      description: entry.description[lang],
    }
  );
};

const proficient = (state: WorldState, characterId: string, toolId: string): boolean =>
  state.characterSheets.get(characterId)?.tools?.includes(toolId) === true;

const holds = (state: WorldState, characterId: string, catalogId: string): boolean =>
  carriedBy(state, characterId).some(
    (itemId) =>
      possessionOf(state, itemId)?.catalogId === catalogId &&
      state.entities.get(itemId)?.status === 'active',
  );

const prepared = (sheet: CharacterSheet, spellId: string): boolean =>
  sheet.spellcasting.some((source) => source.spells.includes(spellId));

interface Plan {
  readonly catalogId: string;
  readonly name: string;
  readonly toolId: string | null;
  readonly days: number;
  readonly materialsCp: number;
}

/** What a thing from the catalog takes: its tool at hand, the rule's days and materials. */
function catalogPlan(
  context: DecisionContext,
  characterId: string,
  entry: ItemEntry | undefined,
  quantity: number,
): Plan | Decision {
  const { state } = context;
  const craft = entry && craftOf(entry);
  if (!entry || !craft)
    return reject('INVALID_ITEM', 'No tool makes it', { reason: 'NOT_CRAFTABLE' });
  if (quantity > 1 && !entry.stackable)
    return reject('INVALID_ITEM', 'One at a time', { reason: 'NOT_CRAFTABLE' });
  const known = craft.tools.filter((toolId) => proficient(state, characterId, toolId));
  if (known.length === 0)
    return reject('ILLEGAL_ACTION', 'NOT_PROFICIENT', { reason: 'NOT_PROFICIENT' });
  const toolId = known.find((one) => holds(state, characterId, one));
  if (toolId === undefined) return reject('ILLEGAL_ACTION', 'NO_TOOL', { reason: 'NO_TOOL' });
  return {
    catalogId: entry.itemId,
    name: wordsOf(context, entry).name,
    toolId,
    ...craftCost(entry.valueCp, quantity, craft),
  };
}

/** A Spell Scroll: the spell prepared, Arcana or the calligrapher's supplies at hand. */
function scrollPlan(
  context: DecisionContext,
  characterId: string,
  spellId: string,
  sheet: CharacterSheet,
): Plan | Decision {
  const { state } = context;
  const spell = context.characters?.spell?.(spellId, language(state)) ?? null;
  if (spell === null || !prepared(sheet, spellId))
    return reject('ILLEGAL_ACTION', 'NOT_PREPARED', { reason: 'NOT_PREPARED' });
  const arcana = sheet.skills.proficient.includes('arcana');
  const supplies =
    proficient(state, characterId, SCRIBING_TOOL) && holds(state, characterId, SCRIBING_TOOL);
  if (!arcana && !supplies)
    return reject('ILLEGAL_ACTION', 'NOT_PROFICIENT', { reason: 'NOT_PROFICIENT' });
  const cost = SPELL_SCROLL_COSTS[spell.level];
  const entry = itemEntry(scrollCatalogId(spell.level));
  if (!cost || !entry) return reject('INVALID_ITEM', 'No scroll for it');
  return {
    catalogId: entry.itemId,
    name: `${wordsOf(context, entry).name}: ${spell.name}`,
    toolId: arcana ? null : SCRIBING_TOOL,
    days: cost.days,
    materialsCp: cost.costCp,
  };
}

export function decideStartCrafting(
  context: DecisionContext,
  command: ResolvedCommandOf<'StartCrafting'>,
): Decision {
  const { state } = context;
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  if (isCombatant(state, command.characterId))
    return reject('COMBAT_ALREADY_ACTIVE', 'No crafting while the fight runs');
  const sheet = state.characterSheets.get(command.characterId);
  if (!sheet) return reject('INVALID_COMMAND', 'A character with a sheet crafts');
  if (crafting(state, command.characterId))
    return reject('ILLEGAL_ACTION', 'BUSY', { reason: 'BUSY' });
  if (state.crafting.size >= MAX_CRAFT_PROJECTS)
    return reject('ILLEGAL_ACTION', 'Too many projects at once');
  const plan =
    command.spellId === undefined
      ? catalogPlan(
          context,
          command.characterId,
          itemEntry(command.catalogId ?? ''),
          command.quantity,
        )
      : command.quantity > 1 || command.helperIds.length > 0
        ? reject('INVALID_COMMAND', 'A scroll is one, and the scribe’s own work')
        : scrollPlan(context, command.characterId, command.spellId, sheet);
  if ('ok' in plan) return plan;
  // Helpers: here, of the party, proficient with the tool, on no other project.
  const here = actor.value.placement?.locationId;
  if (command.helperIds.length > (campaignOptions(state).craftingHelpers ?? 1))
    return reject('ILLEGAL_ACTION', 'TOO_MANY_HELPERS', { reason: 'TOO_MANY_HELPERS' });
  for (const helperId of command.helperIds) {
    const helper = state.entities.get(helperId);
    if (
      helperId === command.characterId ||
      !isPartyCharacter(state, helperId) ||
      helper?.status !== 'active' ||
      here === undefined ||
      helper.placement?.locationId !== here
    )
      return reject('NOT_PRESENT', `"${helperId}" cannot help here`, { entityId: helperId });
    if (plan.toolId === null || !proficient(state, helperId, plan.toolId))
      return reject('ILLEGAL_ACTION', 'NOT_PROFICIENT', { reason: 'NOT_PROFICIENT', helperId });
    if (crafting(state, helperId)) return reject('ILLEGAL_ACTION', 'BUSY', { reason: 'BUSY' });
  }
  const [projectId, ...change] = command.resolution.ids;
  if (projectId === undefined) return reject('INVALID_COMMAND', 'No project ID was drawn');
  const spent = spendCoins(state, command.characterId, plan.materialsCp, change);
  if (!spent) return reject('ILLEGAL_ACTION', 'NOT_ENOUGH_COINS', { reason: 'NOT_ENOUGH_COINS' });
  const project: CraftProject = {
    crafterId: command.characterId,
    helperIds: [...command.helperIds],
    catalogId: plan.catalogId,
    quantity: command.quantity,
    spellId: command.spellId ?? null,
    name: plan.name,
    toolId: plan.toolId,
    materialsCp: plan.materialsCp,
    hoursNeeded: plan.days * CRAFT_DAY_HOURS,
    hoursDone: 0,
  };
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }, { kind: 'sheet' }, ...command.helperIds.map(perceived)],
    [...spent, { type: 'CraftingStarted', payload: { projectId, project } }],
    'free',
  );
}

const perceived = (entityId: string) => ({ kind: 'perceived' as const, entityId });

export function decideAbandonCrafting(
  state: WorldState,
  command: ResolvedCommandOf<'AbandonCrafting'>,
): Decision {
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  if (state.crafting.get(command.projectId)?.crafterId !== command.characterId)
    return reject('NOT_PRESENT', 'No such project of yours', { projectId: command.projectId });
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }],
    [{ type: 'CraftingAbandoned', payload: { projectId: command.projectId } }],
    'free',
  );
}

/** The DM's downtime: each project worked, those done made, the made thing in the crafter's pack. */
export function decideWorkDowntime(
  context: DecisionContext,
  command: ResolvedCommandOf<'WorkDowntime'>,
): Decision {
  const { state } = context;
  const ids = [...command.resolution.ids];
  const events: KernelEvent[] = [];
  const projects = [...state.crafting].filter(
    ([projectId]) => command.projectId === undefined || projectId === command.projectId,
  );
  if (projects.length === 0) return reject('NOT_PRESENT', 'No project is under way');
  for (const [projectId, project] of projects) {
    const workers = [project.crafterId, ...project.helperIds].filter(
      (id) => state.entities.get(id)?.status === 'active',
    );
    const sheet = state.characterSheets.get(project.crafterId);
    // A scroll's days count while its scribe has the spell prepared.
    const working =
      workers.includes(project.crafterId) &&
      (project.spellId === null || (sheet !== undefined && prepared(sheet, project.spellId)));
    if (!working) continue;
    const hoursDone = Math.min(
      project.hoursNeeded,
      project.hoursDone + command.days * CRAFT_DAY_HOURS * workers.length,
    );
    events.push({ type: 'CraftingWorked', payload: { projectId, hoursDone } });
    if (hoursDone < project.hoursNeeded) continue;
    const itemId = ids.shift();
    if (itemId === undefined) break;
    events.push(...made(context, project, itemId), {
      type: 'CraftingFinished',
      payload: { projectId, itemId },
    });
  }
  if (events.length === 0) return reject('NO_EFFECT', 'No project could be worked');
  return accept(...events);
}

/** The made thing: its entity, named as the project says, granted to the crafter. */
function made(context: DecisionContext, project: CraftProject, itemId: string): KernelEvent[] {
  const entry = itemEntry(project.catalogId);
  return [
    {
      type: 'EntityCreated',
      payload: {
        entityId: itemId,
        kind: 'item',
        name: project.name,
        description: entry ? wordsOf(context, entry).description : '',
        existsSince: null,
        location: null,
      },
    },
    {
      type: 'ItemGranted',
      payload: {
        itemId,
        holderId: project.crafterId,
        catalogId: project.catalogId,
        quantity: project.quantity,
      },
    },
  ];
}
