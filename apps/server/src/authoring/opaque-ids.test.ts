import {
  entityIdSchema,
  knowledgeIdSchema,
  proposableCommandSchema,
  proposalCommandsSchema,
  type ProposableCommand,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { traceScopedIds, withOpaqueIds } from './opaque-ids.ts';

/** G06-client-01: what an AI proposal creates is named by the server, never by the model. */
const NEW = [
  'hooded-poisoner',
  'smugglers-den',
  'secret-cellar',
  'poisoner-plan',
  'poisoner-rumor',
];
const proposal: ProposableCommand[] = proposalCommandsSchema.parse([
  {
    type: 'CreateEntity',
    entityId: 'hooded-poisoner',
    kind: 'npc',
    name: 'Hooded Poisoner',
    existsSince: null,
    placement: { locationId: 'smugglers-den', since: null },
  },
  {
    type: 'CreateEntity',
    entityId: 'smugglers-den',
    kind: 'location',
    name: "Smugglers' Den",
    existsSince: null,
    location: { type: 'building', parentId: 'ravenford' },
  },
  { type: 'PlaceEntity', entityId: 'hooded-poisoner', locationId: 'smugglers-den' },
  { type: 'UpdateEntityProfile', entityId: 'hooded-poisoner', description: 'Smells of almonds.' },
  { type: 'ChangeEntityStatus', entityId: 'hooded-poisoner', status: 'dead' },
  { type: 'SetRelationship', npcId: 'hooded-poisoner', attitude: 'HOSTILE' },
  {
    type: 'AddKnowledge',
    knowledgeId: 'poisoner-plan',
    scope: { kind: 'NPC', npcId: 'hooded-poisoner' },
    knowledgeType: 'TESTIMONY',
    statement: 'The Guild master is next.',
    subjects: ['hooded-poisoner', 'merchant-guild', 'smugglers-den'],
    attributedTo: 'hooded-poisoner',
    knownSince: null,
  },
  {
    type: 'AddKnowledge',
    knowledgeId: 'poisoner-rumor',
    scope: { kind: 'CHARACTER', characterId: 'hooded-poisoner' },
    knowledgeType: 'RUMOR',
    statement: 'Someone in a hood buys almonds.',
    relations: [
      { type: 'SUPPORTS', knowledgeId: 'poisoner-plan' },
      { type: 'SUPPORTS', knowledgeId: 'seed-record' },
    ],
    knownSince: null,
  },
  { type: 'SetDisclosure', knowledgeId: 'poisoner-plan', disclosure: 'GUARDED' },
  {
    type: 'SetClaim',
    target: { kind: 'knowledge', knowledgeId: 'poisoner-plan' },
    claim: { subjectId: 'hooded-poisoner', aspect: 'target', value: 'guild-master' },
  },
  {
    type: 'SetClaim',
    target: { kind: 'clue', clueId: 'smugglers-den' },
    claim: { subjectId: 'smugglers-den', aspect: 'owner', value: 'nobody' },
  },
  {
    type: 'CreateEntity',
    entityId: 'secret-cellar',
    kind: 'location',
    name: 'Secret Cellar',
    existsSince: null,
    location: { type: 'room', parentId: 'smugglers-den' },
  },
]);

const TRACE = '00000000-0000-4000-8000-0000000000aa';

/** Every path of an ID field in the command schemas (an entity, clue, or record ID). */
function idPaths(): string[] {
  const paths: string[] = [];
  type Node = { def: Record<string, unknown> };
  const walk = (schema: unknown, path: string): void => {
    if (schema === entityIdSchema || schema === knowledgeIdSchema) {
      paths.push(path);
      return;
    }
    const def = (schema as Node).def;
    switch (def['type']) {
      case 'object':
        for (const [key, field] of Object.entries(def['shape'] as Record<string, unknown>))
          walk(field, `${path}.${key}`);
        return;
      case 'optional':
      case 'nullable':
        walk(def['innerType'], path);
        return;
      case 'array':
        walk(def['element'], `${path}[]`);
        return;
      case 'union':
        for (const option of def['options'] as unknown[]) walk(option, path);
        return;
    }
  };
  for (const option of (proposableCommandSchema as unknown as Node).def['options'] as Node[]) {
    const type = (
      (option.def['shape'] as Record<string, Node>)['type']?.def['values'] as string[]
    )[0];
    walk(option, type ?? '?');
  }
  return paths;
}

/** The values at a path such as `AddKnowledge.relations[].knowledgeId` in the given commands. */
function valuesAt(commands: readonly ProposableCommand[], path: string): unknown[] {
  const [type, ...keys] = path.split('.');
  let values: unknown[] = commands.filter((command) => command.type === type);
  for (const key of keys) {
    const name = key.replace('[]', '');
    values = values.flatMap((value) => {
      const next = (value as Record<string, unknown> | null)?.[name];
      if (next === undefined || next === null) return [];
      return key.endsWith('[]') ? next : [next];
    });
  }
  return values;
}

describe('opaque IDs for what an AI proposal creates', () => {
  it('replaces every model-chosen entity and record ID, and every reference to them', () => {
    const commands = withOpaqueIds(proposal, traceScopedIds(TRACE));
    const text = JSON.stringify(commands);
    for (const id of NEW) expect(text).not.toContain(id);
    const npc = commands[0]?.type === 'CreateEntity' ? commands[0].entityId : '';
    const place = commands[1]?.type === 'CreateEntity' ? commands[1].entityId : '';
    const plan = commands[6]?.type === 'AddKnowledge' ? commands[6].knowledgeId : '';
    expect(npc).toMatch(/^npc-[0-9a-f]{8}$/);
    expect(place).toMatch(/^location-[0-9a-f]{8}$/);
    expect(plan).toMatch(/^knowledge-[0-9a-f]{8}$/);
    expect(commands[0]).toMatchObject({ placement: { locationId: place } });
    expect(commands[1]).toMatchObject({ location: { parentId: 'ravenford' } });
    expect(commands[2]).toMatchObject({ entityId: npc, locationId: place });
    expect(commands[5]).toMatchObject({ npcId: npc });
    expect(commands[6]).toMatchObject({
      scope: { kind: 'NPC', npcId: npc },
      subjects: [npc, 'merchant-guild', place],
      attributedTo: npc,
      statement: 'The Guild master is next.',
    });
    expect(commands[7]).toMatchObject({
      scope: { kind: 'CHARACTER', characterId: npc },
      relations: [{ knowledgeId: plan }, { knowledgeId: 'seed-record' }],
    });
    expect(commands[8]).toMatchObject({ knowledgeId: plan });
    expect(commands[9]).toMatchObject({
      target: { knowledgeId: plan },
      claim: { subjectId: npc, value: 'guild-master' },
    });
    expect(commands[10]).toMatchObject({ target: { clueId: place }, claim: { subjectId: place } });
    expect(commands[11]).toMatchObject({ location: { parentId: place } });
    expect(proposalCommandsSchema.safeParse(commands).success).toBe(true);
  });

  it('rewrites every ID field the command schemas have', () => {
    const paths = idPaths();
    // The walk reaches the fields it is about.
    expect(paths).toEqual(
      expect.arrayContaining(['SetClaim.target.clueId', 'AddKnowledge.relations[].knowledgeId']),
    );
    const before = new Set(NEW);
    const commands = withOpaqueIds(proposal, traceScopedIds(TRACE));
    for (const path of paths) {
      // The sample covers the field, with an ID the proposal creates…
      expect(
        valuesAt(proposal, path).some((value) => before.has(value as string)),
        path,
      ).toBe(true);
      // …and no created ID is left in it after the rewrite.
      expect(
        valuesAt(commands, path).filter((value) => before.has(value as string)),
        path,
      ).toEqual([]);
    }
  });

  it('gives the same trace the same IDs, so proposing it twice collides at commit', () => {
    const once = withOpaqueIds(proposal, traceScopedIds(TRACE));
    expect(withOpaqueIds(proposal, traceScopedIds(TRACE))).toEqual(once);
    const other = withOpaqueIds(proposal, traceScopedIds('00000000-0000-4000-8000-0000000000bb'));
    expect(other[0]).not.toEqual(once[0]);
  });

  it('leaves a proposal that creates nothing, or leaves the IDs to the server, unchanged', () => {
    const existing = proposal.slice(2, 6);
    expect(withOpaqueIds(existing, () => 'unused')).toEqual(existing);
    const unnamed = proposalCommandsSchema.parse([
      { type: 'CreateEntity', kind: 'npc', name: 'Someone', existsSince: null },
    ]);
    expect(withOpaqueIds(unnamed, () => 'unused')).toEqual(unnamed);
  });
});
