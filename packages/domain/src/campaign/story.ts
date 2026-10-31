import { CHECK_METHODS, type QuestDefinition, type QuestMilestone } from '@ltw/contracts';

import {
  compareKey,
  entityReference,
  error,
  identity,
  uniqueKeys,
  type PlanContext,
} from './context.ts';

export function validateStory(context: PlanContext): void {
  const { content } = context;
  uniqueKeys(context, content.clues, 'clues');
  uniqueKeys(context, content.conflicts, 'conflicts');
  uniqueKeys(context, content.situations, 'situations');
  uniqueKeys(context, content.encounters, 'encounters');
  const clues = new Set(content.clues.map((clue) => clue.key));
  for (const clue of content.clues) {
    const path = `clues.${clue.key}`;
    entityReference(context, clue.entity, `${path}.entity`);
    for (const key of clue.subjects) entityReference(context, key, `${path}.subjects.${key}`);
    const check = clue.method !== 'magic' && CHECK_METHODS.has(clue.method);
    if (check !== (clue.dc !== undefined))
      error(context, 'CLUE_DC', `${path}.dc`, 'Checks require a DC; inspect and magic forbid one');
  }
  for (const conflict of content.conflicts)
    for (const key of conflict.actors)
      entityReference(context, key, `conflicts.${conflict.key}.actors.${key}`);
  for (const situation of content.situations) {
    const path = `situations.${situation.key}`;
    entityReference(context, situation.location, `${path}.location`, ['location']);
    for (const key of situation.participants)
      entityReference(context, key, `${path}.participants.${key}`);
    for (const key of situation.clueKeys)
      if (!clues.has(key))
        error(
          context,
          'REFERENCE_MISSING',
          `${path}.clueKeys.${key}`,
          'Clue reference does not exist',
        );
  }
  for (const encounter of content.encounters) {
    const path = `encounters.${encounter.key}`;
    const location = entityReference(context, encounter.location, `${path}.location`, ['location']);
    if (location && location.status !== 'active')
      error(
        context,
        'ENCOUNTER_LOCATION_INACTIVE',
        `${path}.location`,
        'Prepared encounter needs a usable place',
      );
    const seen = new Set<string>();
    for (const combatant of encounter.combatants) {
      const entity = entityReference(
        context,
        combatant.entity,
        `${path}.combatants.${combatant.entity}`,
        ['character', 'npc', 'creature'],
      );
      if (seen.has(combatant.entity))
        error(
          context,
          'DUPLICATE_COMBATANT',
          `${path}.combatants`,
          'Combatant references must be unique',
        );
      seen.add(combatant.entity);
      if (entity && !entity.sheet && !entity.statBlock)
        error(
          context,
          'COMBATANT_STATS',
          `${path}.combatants.${combatant.entity}`,
          'A prepared combatant needs supported statistics',
        );
      if (entity && entity.status !== 'active')
        error(
          context,
          'COMBATANT_INACTIVE',
          `${path}.combatants.${combatant.entity}`,
          'A prepared combatant must be active',
        );
    }
  }
  const visuals = new Set<string>();
  for (const visual of content.visuals) {
    const path = `visuals.${visual.entity}.${visual.purpose}`;
    entityReference(
      context,
      visual.entity,
      `${path}.entity`,
      visual.purpose === 'battle-map'
        ? ['location']
        : visual.purpose === 'figure'
          ? ['npc', 'character', 'creature']
          : undefined,
    );
    const key = `${visual.entity}:${visual.purpose}`;
    if (visuals.has(key))
      error(
        context,
        'DUPLICATE_VISUAL',
        path,
        'Keep one brief per entity and purpose; candidates are separate image jobs',
      );
    visuals.add(key);
  }
  const relationships = new Set<string>();
  for (const relationship of content.relationships) {
    entityReference(context, relationship.npc, `relationships.${relationship.npc}`, ['npc']);
    if (relationships.has(relationship.npc))
      error(
        context,
        'DUPLICATE_RELATIONSHIP',
        `relationships.${relationship.npc}`,
        'An NPC has one initial attitude',
      );
    relationships.add(relationship.npc);
  }
}

/** Every entity-reference branch is rewritten; adding a milestone kind requires updating here. */
function rewriteMilestone(
  context: PlanContext,
  questId: string,
  milestone: QuestMilestone,
): QuestMilestone {
  const path = `quests.${questId}.${milestone.stage}`;
  switch (milestone.kind) {
    case 'reached':
    case 'examined-at':
    case 'survived-fight-at':
    case 'returned-to':
      entityReference(context, milestone.locationId, `${path}.locationId`, ['location']);
      return { ...milestone, locationId: identity(context.ids.entities, milestone.locationId) };
    case 'hypothesized':
    case 'contradiction-found':
      entityReference(context, milestone.subject, `${path}.subject`);
      return { ...milestone, subject: identity(context.ids.entities, milestone.subject) };
    case 'told-by':
      entityReference(context, milestone.subject, `${path}.subject`);
      entityReference(context, milestone.informant, `${path}.informant`, ['npc']);
      return {
        ...milestone,
        subject: identity(context.ids.entities, milestone.subject),
        informant: identity(context.ids.entities, milestone.informant),
      };
  }
}

function renameStages(milestone: QuestMilestone, stage: (key: string) => string): QuestMilestone {
  return milestone.kind === 'returned-to'
    ? { ...milestone, stage: stage(milestone.stage), after: stage(milestone.after) }
    : { ...milestone, stage: stage(milestone.stage) };
}

/**
 * Quest keys and stage slugs become their server IDs (Gate 07, G07-03): an authored slug can
 * state a plot point, and quest logs reach players. Without quest identities (the engine's
 * bootstrap, which never publishes quests, and revisions saved before them) the authored keys
 * stay; the server compiler refuses to activate such a revision.
 */
export function rewriteQuests(context: PlanContext): QuestDefinition[] {
  const seen = new Set<string>();
  const { quests, stages } = context.ids;
  return [...context.content.quests]
    .sort((a, b) => compareKey(a.questId, b.questId))
    .map((quest) => {
      if (seen.has(quest.questId))
        error(
          context,
          'DUPLICATE_QUEST',
          `quests.${quest.questId}`,
          'Quest definitions must have unique IDs',
        );
      seen.add(quest.questId);
      entityReference(
        context,
        quest.activation.subject,
        `quests.${quest.questId}.activation.subject`,
      );
      const stageIds = stages?.[quest.questId] ?? {};
      const stage = (key: string) => (quests === undefined ? key : identity(stageIds, key));
      return {
        ...quest,
        questId: quests === undefined ? quest.questId : identity(quests, quest.questId),
        activation: {
          ...quest.activation,
          subject: identity(context.ids.entities, quest.activation.subject),
        },
        milestones: quest.milestones.map((milestone) =>
          renameStages(rewriteMilestone(context, quest.questId, milestone), stage),
        ),
      };
    });
}
