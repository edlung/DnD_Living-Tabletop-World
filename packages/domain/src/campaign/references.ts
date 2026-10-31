import type { CampaignIdentities } from '@ltw/contracts';

import { isAtOrAfter } from '../kernel/world-time.ts';
import { PLACEABLE_KINDS } from '../kernel/state.ts';
import {
  compareKey,
  entityReference,
  error,
  identity,
  missing,
  uniqueKeys,
  type PlanContext,
} from './context.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SPEAKERS = ['npc', 'character', 'creature', 'faction'] as const;

export function validateIdentities(context: PlanContext): void {
  const required: Record<Exclude<keyof CampaignIdentities, 'scene'>, readonly string[]> = {
    entities: context.content.entities.map((entity) => entity.key),
    knowledge: context.content.knowledge.map((record) => record.key),
    clues: context.content.clues.map((clue) => clue.key),
    encounters: context.content.encounters.map((encounter) => encounter.key),
  };
  const seen = new Set<string>();
  const check = (id: string, path: string) => {
    if (!UUID.test(id))
      error(context, 'IDENTITY_INVALID', path, 'Identity must be a lowercase opaque UUID');
    else if (seen.has(id))
      error(context, 'IDENTITY_COLLISION', path, 'Canonical identities must be unique');
    seen.add(id);
  };
  for (const namespace of ['entities', 'knowledge', 'clues', 'encounters'] as const) {
    for (const key of required[namespace]) {
      if (!identity(context.ids[namespace], key))
        error(
          context,
          'IDENTITY_MISSING',
          `identities.${namespace}.${key}`,
          'Server identity is missing',
        );
    }
    for (const [key, id] of Object.entries(context.ids[namespace]).sort(([a], [b]) =>
      compareKey(a, b),
    ))
      check(id, `identities.${namespace}.${key}`);
  }
  check(context.ids.scene, 'identities.scene');
}

export function validateEntities(context: PlanContext): void {
  const { content } = context;
  uniqueKeys(context, content.entities, 'entities');
  for (const entity of content.entities) {
    const path = `entities.${entity.key}`;
    if ((entity.kind === 'location') !== (entity.location !== undefined))
      error(context, 'LOCATION_METADATA', path, 'Only locations require location metadata');
    if (entity.location?.parent)
      entityReference(context, entity.location.parent, `${path}.location.parent`, ['location']);
    if (entity.placement) {
      entityReference(context, entity.placement.location, `${path}.placement.location`, [
        'location',
      ]);
      if (!PLACEABLE_KINDS.has(entity.kind))
        error(context, 'INVALID_PLACEMENT', path, 'This kind cannot be placed');
      if (
        !isAtOrAfter(entity.placement.since, entity.existsSince) ||
        (entity.placement.since !== null && entity.placement.since > content.world.startsAt)
      )
        error(
          context,
          'PLACEMENT_TIME',
          `${path}.placement.since`,
          'Placement must be within existence and no later than the start',
        );
    }
    if (entity.existsSince !== null && entity.existsSince > content.world.startsAt)
      error(
        context,
        'ENTITY_IN_FUTURE',
        `${path}.existsSince`,
        'An initial entity cannot begin after the campaign starts',
      );
    if (entity.sheet && entity.kind !== 'character')
      error(context, 'SHEET_KIND', `${path}.sheet`, 'Character sheets belong to characters');
    if (entity.statBlock && entity.kind !== 'npc' && entity.kind !== 'creature')
      error(
        context,
        'STAT_BLOCK_KIND',
        `${path}.statBlock`,
        'Stat blocks belong to NPCs or creatures',
      );
    if (entity.kind === 'character' && !entity.sheet)
      missing(
        context,
        'SHEET_INCOMPLETE',
        `${path}.sheet`,
        'A character needs a complete supported sheet',
      );
    if (entity.sheet?.concentration?.targetId)
      entityReference(
        context,
        entity.sheet.concentration.targetId,
        `${path}.sheet.concentration.targetId`,
        ['character', 'npc', 'creature'],
      );
  }
  if (content.world.startLocation === null)
    missing(context, 'START_LOCATION_INCOMPLETE', 'world.startLocation', 'Choose an initial place');
  else {
    const start = entityReference(context, content.world.startLocation, 'world.startLocation', [
      'location',
    ]);
    if (start && start.status !== 'active')
      error(
        context,
        'START_LOCATION_INACTIVE',
        'world.startLocation',
        'The initial place must be usable',
      );
  }
  if (new Set(content.party).size !== content.party.length)
    error(context, 'DUPLICATE_PARTY_SEAT', 'party', 'Prepared seats must be unique');
  if (content.party.length < content.brief.partySize)
    missing(context, 'PARTY_INCOMPLETE', 'party', 'Prepare every requested character seat');
  for (const key of content.party) {
    const entity = entityReference(context, key, `party.${key}`, ['character']);
    if (!entity) continue;
    if (entity.status !== 'active')
      error(
        context,
        'PARTY_INACTIVE',
        `party.${key}`,
        'A prepared player character must be active',
      );
    if (!entity.placement)
      missing(
        context,
        'PARTY_PLACEMENT_INCOMPLETE',
        `party.${key}`,
        'Place the prepared character',
      );
    if (
      entity.sheet &&
      entity.sheet.classes.reduce((total, entry) => total + entry.level, 0) !==
        content.brief.partyLevel
    )
      error(
        context,
        'PARTY_LEVEL_MISMATCH',
        `party.${key}.sheet`,
        'Prepared character level differs from the brief',
      );
  }
  if (!content.world.opening.trim())
    missing(context, 'OPENING_INCOMPLETE', 'world.opening', 'Prepare the opening situation');
  if (content.firstSession.length === 0 || content.firstSession.every((step) => !step.trim()))
    missing(context, 'SESSION_PLAN_INCOMPLETE', 'firstSession', 'Prepare the first session');
}

export function validateKnowledge(context: PlanContext): void {
  uniqueKeys(context, context.content.knowledge, 'knowledge');
  for (const record of context.content.knowledge) {
    const path = `knowledge.${record.key}`;
    const scope = record.scope;
    if (scope.kind === 'NPC' || scope.kind === 'CHARACTER') {
      const holder = entityReference(context, scope.holder, `${path}.scope.holder`, [
        scope.kind === 'NPC' ? 'npc' : 'character',
      ]);
      if (holder && !isAtOrAfter(record.knownSince, holder.existsSince))
        error(
          context,
          'KNOWLEDGE_BEFORE_HOLDER',
          `${path}.knownSince`,
          'A holder cannot know before existing',
        );
    }
    if (
      scope.kind === 'WORLD_TRUTH' &&
      record.knowledgeType !== 'FACT' &&
      record.knowledgeType !== 'SECRET'
    )
      error(
        context,
        'WORLD_TRUTH_TYPE',
        `${path}.knowledgeType`,
        'World truth must be FACT or SECRET',
      );
    if (record.knownSince !== null && record.knownSince > context.content.world.startsAt)
      error(
        context,
        'KNOWLEDGE_IN_FUTURE',
        `${path}.knownSince`,
        'Initial knowledge cannot come from the future',
      );
    if (new Set(record.subjects).size !== record.subjects.length)
      error(context, 'DUPLICATE_SUBJECT', `${path}.subjects`, 'Knowledge subjects must be unique');
    for (const key of record.subjects) {
      const subject = entityReference(context, key, `${path}.subjects.${key}`);
      if (subject && !isAtOrAfter(record.knownSince, subject.existsSince))
        error(
          context,
          'KNOWLEDGE_BEFORE_SUBJECT',
          `${path}.knownSince`,
          'Knowledge cannot predate its subject',
        );
    }
    if (record.knowledgeType === 'TESTIMONY' && !record.attributedTo)
      error(context, 'TESTIMONY_SPEAKER', `${path}.attributedTo`, 'Testimony needs a speaker');
    if (record.attributedTo) {
      const speaker = entityReference(
        context,
        record.attributedTo,
        `${path}.attributedTo`,
        SPEAKERS,
      );
      if (record.knowledgeType !== 'TESTIMONY' && record.knowledgeType !== 'RUMOR')
        error(
          context,
          'ATTRIBUTION_TYPE',
          `${path}.attributedTo`,
          'Only testimony and rumor carry attribution',
        );
      if (speaker && !isAtOrAfter(record.knownSince, speaker.existsSince))
        error(
          context,
          'KNOWLEDGE_BEFORE_SPEAKER',
          `${path}.knownSince`,
          'Knowledge cannot predate its speaker',
        );
    }
    if (record.disclosure !== undefined && scope.kind !== 'NPC')
      error(
        context,
        'DISCLOSURE_SCOPE',
        `${path}.disclosure`,
        'Disclosure belongs to an NPC-held record',
      );
    const relationKeys = new Set<string>();
    for (const relation of record.relations) {
      if (!context.knowledge.has(relation.knowledge))
        error(
          context,
          'REFERENCE_MISSING',
          `${path}.relations`,
          `Knowledge reference ${relation.knowledge} does not exist`,
        );
      const key = `${relation.type}:${relation.knowledge}`;
      if (relationKeys.has(key))
        error(context, 'DUPLICATE_RELATION', `${path}.relations`, 'Relations must be unique');
      relationKeys.add(key);
    }
  }
}
