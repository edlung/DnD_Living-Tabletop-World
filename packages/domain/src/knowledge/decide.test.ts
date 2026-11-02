import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER,
  START,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';

let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    { type: 'CreateEntity', entityId: 'hero', kind: 'character', name: 'Hero', existsSince: null },
    { type: 'CreateEntity', entityId: 'cult', kind: 'faction', name: 'Cult', existsSince: null },
    { type: 'CreateEntity', entityId: 'kid', kind: 'npc', name: 'Kid', existsSince: START - 100 },
  ]) {
    expectAccepted(await harness.submit(command));
  }
});

const knowledge = (knowledgeId: string, extra: Record<string, unknown> = {}) => ({
  type: 'AddKnowledge',
  knowledgeId,
  scope: { kind: 'PUBLIC' },
  knowledgeType: 'FACT',
  statement: `Statement ${knowledgeId}`,
  knownSince: null,
  ...extra,
});

describe('AddKnowledge', () => {
  it('stores an immutable record with normalized references and provenance', async () => {
    expectAccepted(
      await harness.submit(
        knowledge('k1', { scope: { kind: 'NPC', npcId: 'npc' }, subjects: ['town', 'lamp'] }),
        { commandId: 'add-k1' },
      ),
    );

    expect((await harness.state()).knowledge.get('k1')).toMatchObject({
      knowledgeId: 'k1',
      scope: { kind: 'NPC', npcId: 'npc' },
      knowledgeType: 'FACT',
      subjects: ['town', 'lamp'],
      attributedTo: null,
      relations: [],
      knownSince: null,
      origin: { commandId: 'add-k1', actorId: 'dm-1', worldTime: START },
    });
  });

  it('lets only the DM or the system add knowledge or assign characters', async () => {
    expectRejected(
      await harness.submit(knowledge('k1', { scope: { kind: 'WORLD_TRUTH' } }), { actor: PLAYER }),
      'FORBIDDEN',
    );
    expectRejected(
      await harness.submit(
        { type: 'AssignCharacter', characterId: 'hero', playerActorId: 'player-1' },
        { actor: PLAYER },
      ),
      'FORBIDDEN',
    );
  });

  it('requires holders of the right kind', async () => {
    expectRejected(
      await harness.submit(knowledge('k1', { scope: { kind: 'NPC', npcId: 'hero' } })),
      'INVALID_KNOWLEDGE',
    );
    expectRejected(
      await harness.submit(knowledge('k2', { scope: { kind: 'CHARACTER', characterId: 'npc' } })),
      'INVALID_KNOWLEDGE',
    );
    expectRejected(
      await harness.submit(knowledge('k3', { scope: { kind: 'NPC', npcId: 'nobody' } })),
      'ENTITY_NOT_FOUND',
    );
    expectAccepted(
      await harness.submit(knowledge('k4', { scope: { kind: 'CHARACTER', characterId: 'hero' } })),
    );
  });

  it('keeps WORLD_TRUTH to FACT and SECRET', async () => {
    expectRejected(
      await harness.submit(
        knowledge('k1', { scope: { kind: 'WORLD_TRUTH' }, knowledgeType: 'HYPOTHESIS' }),
      ),
      'INVALID_KNOWLEDGE',
    );
    expectAccepted(
      await harness.submit(
        knowledge('k2', { scope: { kind: 'WORLD_TRUTH' }, knowledgeType: 'SECRET' }),
      ),
    );
  });

  it('validates subjects, attribution, and relations', async () => {
    expectRejected(
      await harness.submit(knowledge('a', { subjects: ['ghost'] })),
      'ENTITY_NOT_FOUND',
    );
    expectRejected(
      await harness.submit(knowledge('b', { subjects: ['town', 'town'] })),
      'INVALID_KNOWLEDGE',
    );
    expectRejected(
      await harness.submit(knowledge('c', { knowledgeType: 'TESTIMONY' })),
      'INVALID_KNOWLEDGE',
    );
    expectRejected(
      await harness.submit(knowledge('d', { attributedTo: 'npc' })),
      'INVALID_KNOWLEDGE',
    );
    expectRejected(
      await harness.submit(knowledge('e', { knowledgeType: 'TESTIMONY', attributedTo: 'lamp' })),
      'INVALID_KNOWLEDGE',
    );
    expectAccepted(
      await harness.submit(knowledge('f', { knowledgeType: 'TESTIMONY', attributedTo: 'npc' })),
    );
    expectAccepted(
      await harness.submit(knowledge('g', { knowledgeType: 'RUMOR', attributedTo: 'cult' })),
    );
    expectRejected(
      await harness.submit(
        knowledge('h', { relations: [{ type: 'SUPPORTS', knowledgeId: 'missing' }] }),
      ),
      'KNOWLEDGE_NOT_FOUND',
    );
    expectRejected(
      await harness.submit(
        knowledge('i', {
          relations: [
            { type: 'SUPPORTS', knowledgeId: 'f' },
            { type: 'SUPPORTS', knowledgeId: 'f' },
          ],
        }),
      ),
      'INVALID_KNOWLEDGE',
    );
  });

  it('never learns after the clock or before the holder existed', async () => {
    expectRejected(
      await harness.submit(knowledge('a', { knownSince: START + 1 })),
      'TEMPORAL_CONFLICT',
    );
    const kid = { kind: 'NPC', npcId: 'kid' };
    expectRejected(
      await harness.submit(knowledge('b', { scope: kid, knownSince: START - 200 })),
      'TEMPORAL_CONFLICT',
    );
    expectRejected(
      await harness.submit(knowledge('c', { scope: kid, knownSince: null })),
      'TEMPORAL_CONFLICT',
    );
    expectAccepted(await harness.submit(knowledge('d', { scope: kid, knownSince: START - 100 })));
  });

  it('never reuses an ID across entities and knowledge', async () => {
    expectRejected(await harness.submit(knowledge('town')), 'ID_ALREADY_USED');
    expectAccepted(await harness.submit(knowledge('k1')));
    expectRejected(
      await harness.submit(knowledge('k1', { statement: 'Other' })),
      'ID_ALREADY_USED',
    );
  });
});

describe('AssignCharacter', () => {
  it('assigns a character to one player, never to the DM; a player may hold several', async () => {
    expectRejected(
      await harness.submit({ type: 'AssignCharacter', characterId: 'npc', playerActorId: 'p1' }),
      'INVALID_ASSIGNMENT',
    );
    expectRejected(
      await harness.submit({ type: 'AssignCharacter', characterId: 'hero', playerActorId: 'dm-1' }),
      'INVALID_ASSIGNMENT',
    );
    expectAccepted(
      await harness.submit({ type: 'AssignCharacter', characterId: 'hero', playerActorId: 'p1' }),
    );
    expectRejected(
      await harness.submit({ type: 'AssignCharacter', characterId: 'hero', playerActorId: 'p2' }),
      'ALREADY_ASSIGNED',
    );
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId: 'hero2',
        kind: 'character',
        name: 'H2',
        existsSince: null,
      }),
    );
    // A second character for the same player (docs/adr/0044-online-play.md §6).
    expectAccepted(
      await harness.submit({ type: 'AssignCharacter', characterId: 'hero2', playerActorId: 'p1' }),
    );
    expect((await harness.state()).roster).toEqual(
      new Map([
        ['hero', 'p1'],
        ['hero2', 'p1'],
      ]),
    );
  });
});

describe('knowledge and undo (ADR 0006 §9)', () => {
  it('blocks undoing an entity while knowledge depends on it, then allows it explicitly', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'CreateEntity', entityId: 'tomas', kind: 'npc', name: 'Tomas', existsSince: null },
        { commandId: 'make-tomas' },
      ),
    );
    expectAccepted(
      await harness.submit(knowledge('tomas-saw', { scope: { kind: 'NPC', npcId: 'tomas' } }), {
        commandId: 'tomas-knows',
      }),
    );
    expectAccepted(
      await harness.submit(
        knowledge('party-heard', {
          scope: { kind: 'PARTY' },
          relations: [{ type: 'DERIVED_FROM', knowledgeId: 'tomas-saw' }],
        }),
        { commandId: 'party-learns' },
      ),
    );

    const blocked = expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'make-tomas' }),
      'UNDO_UNSAFE',
    );
    expect(blocked.details?.['blockers']).toEqual([
      expect.objectContaining({ commandId: 'tomas-knows' }),
    ]);
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: 'tomas-knows' }),
      'UNDO_UNSAFE',
    );

    for (const target of ['party-learns', 'tomas-knows', 'make-tomas']) {
      expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: target }));
    }
    const state = await harness.state();
    expect(state.knowledge.has('tomas-saw')).toBe(false);
    expect(state.knowledge.has('party-heard')).toBe(false);
    expect(state.entities.has('tomas')).toBe(false);
  });

  it('undoes a character assignment', async () => {
    expectAccepted(
      await harness.submit(
        { type: 'AssignCharacter', characterId: 'hero', playerActorId: 'p1' },
        { commandId: 'assign' },
      ),
    );
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: 'assign' }));
    expect((await harness.state()).roster.size).toBe(0);
  });
});
