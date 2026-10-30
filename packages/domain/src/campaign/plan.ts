import type {
  CampaignIdentities,
  CampaignPackage,
  KernelCommand,
  KnowledgeScope,
} from '@ltw/contracts';

import {
  compareKey,
  identity,
  topological,
  type CampaignPlan,
  type PlanContext,
} from './context.ts';
import { validateEntities, validateIdentities, validateKnowledge } from './references.ts';
import { rewriteQuests, validateStory } from './story.ts';

export type { CampaignPlan } from './context.ts';

/**
 * A pure ordered setup plan. This does not grant authority or replace a World Engine
 * decision. Server materialization assesses the plan in an isolated in-memory store.
 */
export function buildCampaignPlan(
  content: CampaignPackage,
  identities: CampaignIdentities,
): CampaignPlan {
  const context: PlanContext = {
    content,
    ids: identities,
    entities: new Map(content.entities.map((entity) => [entity.key, entity])),
    knowledge: new Map(content.knowledge.map((record) => [record.key, record])),
    findings: [],
    incomplete: false,
  };
  validateIdentities(context);
  validateEntities(context);
  validateKnowledge(context);
  validateStory(context);
  const locations = topological(
    context,
    content.entities.filter((entity) => entity.kind === 'location'),
    (entity) => (entity.location?.parent ? [entity.location.parent] : []),
    'entities',
  );
  const records = topological(
    context,
    content.knowledge,
    (record) => record.relations.map((relation) => relation.knowledge),
    'knowledge',
  );
  const quests = rewriteQuests(context);
  const findings = context.findings.sort(
    (a, b) =>
      compareKey(a.path, b.path) || compareKey(a.code, b.code) || compareKey(a.message, b.message),
  );
  if (findings.some((finding) => finding.severity === 'error'))
    return { commands: [], commandPaths: [], findings, quests: [], incomplete: context.incomplete };

  const commands: KernelCommand[] = [];
  const commandPaths: string[] = [];
  const add = (command: KernelCommand, path: string) => {
    commands.push(command);
    commandPaths.push(path);
  };
  const entities = [
    ...locations,
    ...content.entities
      .filter((entity) => entity.kind !== 'location')
      .sort((a, b) => compareKey(a.key, b.key)),
  ];
  for (const entity of entities) {
    const id = identity(identities.entities, entity.key);
    const path = `entities.${entity.key}`;
    add(
      {
        type: 'CreateEntity',
        entityId: id,
        kind: entity.kind,
        name: entity.name,
        description: entity.description,
        existsSince: entity.existsSince,
        ...(entity.location
          ? {
              location: {
                type: entity.location.type,
                parentId:
                  entity.location.parent === null
                    ? null
                    : identity(identities.entities, entity.location.parent),
              },
            }
          : {}),
        ...(entity.placement
          ? {
              placement: {
                locationId: identity(identities.entities, entity.placement.location),
                since: entity.placement.since,
              },
            }
          : {}),
      },
      path,
    );
  }
  for (const entity of entities) {
    const entityId = identity(identities.entities, entity.key);
    if (entity.sheet) {
      const sheet = structuredClone(entity.sheet);
      if (sheet.concentration?.targetId)
        sheet.concentration.targetId = identity(identities.entities, sheet.concentration.targetId);
      add({ type: 'SetCharacterSheet', entityId, sheet }, `entities.${entity.key}.sheet`);
    }
    if (entity.statBlock)
      add(
        { type: 'SetStatBlock', entityId, statBlock: structuredClone(entity.statBlock) },
        `entities.${entity.key}.statBlock`,
      );
  }
  for (const record of records) {
    const knowledgeId = identity(identities.knowledge, record.key);
    const scope: KnowledgeScope =
      record.scope.kind === 'NPC'
        ? { kind: 'NPC', npcId: identity(identities.entities, record.scope.holder) }
        : record.scope.kind === 'CHARACTER'
          ? { kind: 'CHARACTER', characterId: identity(identities.entities, record.scope.holder) }
          : { kind: record.scope.kind };
    add(
      {
        type: 'AddKnowledge',
        knowledgeId,
        scope,
        knowledgeType: record.knowledgeType,
        statement: record.statement,
        subjects: record.subjects.map((key) => identity(identities.entities, key)),
        knownSince: record.knownSince,
        ...(record.attributedTo
          ? { attributedTo: identity(identities.entities, record.attributedTo) }
          : {}),
        relations: record.relations.map((relation) => ({
          type: relation.type,
          knowledgeId: identity(identities.knowledge, relation.knowledge),
        })),
      },
      `knowledge.${record.key}`,
    );
    if (record.scope.kind === 'NPC')
      add(
        { type: 'SetDisclosure', knowledgeId, disclosure: record.disclosure ?? 'WILLING' },
        `knowledge.${record.key}.disclosure`,
      );
  }
  for (const relationship of [...content.relationships].sort((a, b) => compareKey(a.npc, b.npc)))
    add(
      {
        type: 'SetRelationship',
        npcId: identity(identities.entities, relationship.npc),
        attitude: relationship.attitude,
      },
      `relationships.${relationship.npc}`,
    );
  for (const clue of [...content.clues].sort((a, b) => compareKey(a.key, b.key)))
    add(
      {
        type: 'AddClue',
        clueId: identity(identities.clues, clue.key),
        entityId: identity(identities.entities, clue.entity),
        method: clue.method,
        ...(clue.dc !== undefined ? { dc: clue.dc } : {}),
        statement: clue.statement,
        subjects: clue.subjects.map((key) => identity(identities.entities, key)),
      },
      `clues.${clue.key}`,
    );
  for (const entity of [...content.entities].sort((a, b) => compareKey(a.key, b.key))) {
    if (entity.status !== 'active')
      add(
        {
          type: 'ChangeEntityStatus',
          entityId: identity(identities.entities, entity.key),
          status: entity.status,
        },
        `entities.${entity.key}.status`,
      );
  }
  for (const location of locations)
    if (location.location?.parent === null && location.status === 'active')
      add(
        {
          type: 'SetWeather',
          locationId: identity(identities.entities, location.key),
          weather: content.world.weather,
        },
        `entities.${location.key}.weather`,
      );
  if (content.world.startLocation !== null)
    add(
      {
        type: 'StartScene',
        sceneId: identities.scene,
        title: content.world.name,
        locationId: identity(identities.entities, content.world.startLocation),
      },
      'world.startLocation',
    );
  return { commands, commandPaths, findings, quests, incomplete: context.incomplete };
}
