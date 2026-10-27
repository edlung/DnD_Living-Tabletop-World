import { proposalCommandsSchema, type ProposableCommand } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { withOpaqueEntityIds } from './opaque-ids.ts';

/** G06-client-01: what an AI proposal creates is named by the server, never by the model. */
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
  { type: 'PlaceEntity', entityId: 'hooded-poisoner', locationId: 'market-square' },
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
    type: 'SetClaim',
    target: { kind: 'knowledge', knowledgeId: 'poisoner-plan' },
    claim: { subjectId: 'hooded-poisoner', aspect: 'target', value: 'guild-master' },
  },
]);

describe('opaque IDs for what an AI proposal creates', () => {
  it('replaces every model-chosen ID of a new entity, and every reference to it', () => {
    let n = 0;
    const commands = withOpaqueEntityIds(
      proposal,
      () => `00000000-0000-4000-8000-00000000000${String((n += 1))}`,
    );
    const text = JSON.stringify(commands);
    expect(text).not.toContain('hooded-poisoner');
    expect(text).not.toContain('smugglers-den');
    const [npc, place] = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    expect(commands[0]).toMatchObject({ entityId: npc, placement: { locationId: place } });
    expect(commands[1]).toMatchObject({ entityId: place, location: { parentId: 'ravenford' } });
    expect(commands[2]).toMatchObject({ entityId: npc, locationId: 'market-square' });
    expect(commands[3]).toMatchObject({ entityId: npc });
    expect(commands[4]).toMatchObject({ entityId: npc });
    expect(commands[5]).toMatchObject({ npcId: npc });
    expect(commands[6]).toMatchObject({
      knowledgeId: 'poisoner-plan',
      scope: { kind: 'NPC', npcId: npc },
      subjects: [npc, 'merchant-guild', place],
      attributedTo: npc,
      statement: 'The Guild master is next.',
    });
    expect(commands[7]).toMatchObject({ claim: { subjectId: npc, value: 'guild-master' } });
    expect(proposalCommandsSchema.safeParse(commands).success).toBe(true);
  });

  it('leaves a proposal that creates nothing, or leaves the ID to the server, unchanged', () => {
    const existing = proposal.slice(2);
    expect(withOpaqueEntityIds(existing, () => 'unused')).toEqual(existing);
    const unnamed = proposalCommandsSchema.parse([
      { type: 'CreateEntity', kind: 'npc', name: 'Someone', existsSince: null },
    ]);
    expect(withOpaqueEntityIds(unnamed, () => 'unused')).toEqual(unnamed);
  });
});
