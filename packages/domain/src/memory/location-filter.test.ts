import type { PerspectiveRequest } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  DM,
  PLAYER,
  investigationWorld,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import type { Actor } from '../kernel/actor.ts';
import type { WorldState } from '../kernel/state.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { recallMemories } from './retrieval.ts';

/**
 * Gate 02 regression G02-H01 (reviews/ASTRA_GATE_02_REPORT.md): the memory
 * location filter must follow only containment the perspective may use
 * (ADR 0010 as amended: chains of locations the perspective knows). A hidden
 * location, or a hidden link in a chain, must behave exactly like a
 * nonexistent location: same totals, IDs, scores, and order.
 */
const PERSPECTIVES: [string, Actor, PerspectiveRequest][] = [
  ['PUBLIC', PLAYER, { kind: 'PUBLIC' }],
  ['PARTY', PLAYER, { kind: 'PARTY' }],
  ['PLAYER', PLAYER, { kind: 'PLAYER' }],
  ['NPC:mira-vale', DM, { kind: 'NPC', npcId: 'mira-vale' }],
];

async function dm(world: InvestigationWorld, ...commands: Record<string, unknown>[]) {
  for (const command of commands) {
    const result = await world.submit(command, DM);
    if (result.status === 'rejected') throw new Error(`${result.code}: ${result.message}`);
  }
  return world.state();
}

const location = (entityId: string, parentId: string | null, name = entityId) => ({
  type: 'CreateEntity',
  entityId,
  kind: 'location',
  name,
  existsSince: null,
  location: { type: 'site', parentId },
});
const roomMemory = {
  type: 'RecordMemory',
  memoryId: 'room-memory',
  scope: { kind: 'PUBLIC' },
  memoryKind: 'DECISION',
  summary: 'A remembered room.',
  occurredAt: 0,
  locationId: 'known-room',
};

function recall(state: WorldState, actor: Actor, request: PerspectiveRequest, locationId: string) {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(access.reason);
  return recallMemories(state, access.perspective, { locationId, limit: 50 });
}

/** The reviewer's scenario: a known room inside a location no perspective knows. */
async function hiddenParentWorld(): Promise<WorldState> {
  const world = await investigationWorld();
  return dm(
    world,
    location('hidden-vault', null, 'Secret vault'),
    location('known-room', 'hidden-vault', 'A remembered room'),
    roomMemory,
  );
}

describe('recall_hidden_parent_matches_absent_without_disclosing_containment', () => {
  it.each(PERSPECTIVES)(
    '%s: a hidden parent filters exactly like a nonexistent one',
    async (_label, actor, request) => {
      const state = await hiddenParentWorld();
      const hidden = recall(state, actor, request, 'hidden-vault');
      const absent = recall(state, actor, request, 'missing-vault');
      expect(hidden).toEqual(absent);
      expect(hidden.ok && hidden.total).toBe(0);
    },
  );

  it.each(PERSPECTIVES)(
    '%s: results do not change when only inaccessible ancestry differs',
    async (_label, actor, request) => {
      const variants = await Promise.all([
        // The room inside the hidden vault; the vault inside Ravenford.
        investigationWorld().then((w) =>
          dm(
            w,
            location('hidden-vault', 'ravenford'),
            location('known-room', 'hidden-vault'),
            roomMemory,
          ),
        ),
        // The room inside the hidden vault; the vault on its own.
        investigationWorld().then((w) =>
          dm(w, location('hidden-vault', null), location('known-room', 'hidden-vault'), roomMemory),
        ),
        // The room inside a different hidden place.
        investigationWorld().then((w) =>
          dm(
            w,
            location('other-cellar', null),
            location('hidden-vault', null),
            location('known-room', 'other-cellar'),
            roomMemory,
          ),
        ),
      ]);
      for (const query of [
        'hidden-vault',
        'other-cellar',
        'ravenford',
        'known-room',
        'market-square',
        'missing-vault',
      ]) {
        const results = variants.map((state) => recall(state, actor, request, query));
        expect(results[1], query).toEqual(results[0]);
        expect(results[2], query).toEqual(results[0]);
      }
    },
  );

  it('still nests through locations the perspective knows', async () => {
    const state = await hiddenParentWorld();
    // Market Square lies in Ravenford, and the party knows both: nesting applies.
    const inRavenford = recall(state, PLAYER, { kind: 'PARTY' }, 'ravenford');
    const atSquare = recall(state, PLAYER, { kind: 'PARTY' }, 'market-square');
    const ids = (r: ReturnType<typeof recall>) =>
      r.ok ? r.memories.map((m) => m.memory.memoryId) : [];
    expect(ids(atSquare).length).toBeGreaterThan(0);
    expect(ids(inRavenford)).toEqual(expect.arrayContaining(ids(atSquare)));
    // The DM sees all containment.
    const dmView = recall(state, DM, { kind: 'DM' }, 'hidden-vault');
    expect(ids(dmView)).toEqual(['room-memory']);
  });

  it('nests through a place once the perspective learns it', async () => {
    const world = await investigationWorld();
    const before = await dm(
      world,
      location('hidden-vault', null, 'Secret vault'),
      location('known-room', 'hidden-vault'),
      roomMemory,
    );
    expect(recall(before, PLAYER, { kind: 'PARTY' }, 'hidden-vault')).toMatchObject({ total: 0 });
    const after = await dm(world, {
      type: 'AddKnowledge',
      knowledgeId: 'vault-rumor',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'RUMOR',
      statement: 'People speak of a secret vault.',
      subjects: ['hidden-vault'],
      knownSince: null,
    });
    const found = recall(after, PLAYER, { kind: 'PARTY' }, 'hidden-vault');
    expect(found.ok && found.memories.map((m) => m.memory.memoryId)).toEqual(['room-memory']);
  });
});
