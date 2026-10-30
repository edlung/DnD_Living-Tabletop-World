import type { CampaignRevision } from '@ltw/contracts';

import { campaignEditTargetRecords } from './targets.ts';

export interface CampaignEditDependency {
  readonly source: string;
  readonly dependent: string;
  readonly reason: string;
}

/** Directed structural references only. Shared names/words/subjects never imply an edge. */
export function campaignEditDependencies(
  revision: CampaignRevision,
): readonly CampaignEditDependency[] {
  const { content, identities } = revision;
  const result: CampaignEditDependency[] = [];
  const entityId = (key: string) =>
    identities.entities[key] ? `entity:${identities.entities[key]}` : null;
  const knowledgeId = (key: string) =>
    identities.knowledge[key] ? `knowledge:${identities.knowledge[key]}` : null;
  const clueId = (key: string) => (identities.clues[key] ? `clue:${identities.clues[key]}` : null);
  const encounterId = (key: string) =>
    identities.encounters[key] ? `encounter:${identities.encounters[key]}` : null;
  const add = (dependent: string | null, source: string | null, reason: string) => {
    if (
      dependent !== null &&
      source !== null &&
      dependent !== source &&
      !result.some(
        (edge) => edge.source === source && edge.dependent === dependent && edge.reason === reason,
      )
    )
      result.push({ source, dependent, reason });
  };
  for (const record of campaignEditTargetRecords(revision)) {
    if (record.key !== null) add(record.targetId, `section:${record.section}`, 'Collection member');
  }
  for (const entity of content.entities) {
    if (entity.location?.parent)
      add(entityId(entity.key), entityId(entity.location.parent), 'Location parent');
    if (entity.placement)
      add(entityId(entity.key), entityId(entity.placement.location), 'Initial placement');
    const concentration = entity.sheet?.concentration?.targetId;
    if (concentration) add(entityId(entity.key), entityId(concentration), 'Concentration target');
  }
  for (const item of content.knowledge) {
    const target = knowledgeId(item.key);
    if (item.scope.kind === 'CHARACTER' || item.scope.kind === 'NPC')
      add(target, entityId(item.scope.holder), 'Knowledge holder');
    for (const subject of item.subjects) add(target, entityId(subject), 'Knowledge subject');
    if (item.attributedTo) add(target, entityId(item.attributedTo), 'Attributed speaker');
    for (const relation of item.relations)
      add(target, knowledgeId(relation.knowledge), 'Declared knowledge relation');
  }
  for (const item of content.relationships) {
    const id = identities.entities[item.npc];
    add(id ? `relationship:${id}` : null, entityId(item.npc), 'NPC relationship');
  }
  for (const item of content.clues) {
    add(clueId(item.key), entityId(item.entity), 'Clue source');
    for (const subject of item.subjects) add(clueId(item.key), entityId(subject), 'Clue subject');
  }
  for (const item of content.conflicts)
    for (const actor of item.actors)
      add(`conflict:${item.key}`, entityId(actor), 'Conflict participant');
  for (const item of content.situations) {
    const target = `situation:${item.key}`;
    add(target, entityId(item.location), 'Situation location');
    for (const participant of item.participants)
      add(target, entityId(participant), 'Situation participant');
    for (const clue of item.clueKeys) add(target, clueId(clue), 'Situation clue');
  }
  for (const item of content.encounters) {
    const target = encounterId(item.key);
    add(target, entityId(item.location), 'Encounter location');
    for (const participant of item.combatants)
      add(target, entityId(participant.entity), 'Prepared combatant');
  }
  for (const item of content.visuals) {
    const id = identities.entities[item.entity];
    const target = id ? `visual:${id}:${item.purpose}` : null;
    add(target, entityId(item.entity), 'Visual subject');
    if (item.purpose === 'battle-map')
      for (const encounter of content.encounters)
        if (encounter.location === item.entity)
          add(target, encounterId(encounter.key), 'Battle map geometry');
  }
  for (const quest of content.quests) {
    const target = `quest:${quest.questId}`;
    add(target, entityId(quest.activation.subject), 'Quest activation');
    for (const stage of quest.milestones) {
      if ('locationId' in stage) add(target, entityId(stage.locationId), 'Quest location');
      if ('subject' in stage) add(target, entityId(stage.subject), 'Quest subject');
      if ('informant' in stage) add(target, entityId(stage.informant), 'Quest informant');
    }
  }
  for (const key of content.party) add('section:party', entityId(key), 'Prepared party member');
  if (content.world.startLocation)
    add('section:world', entityId(content.world.startLocation), 'Starting location');
  return result;
}
