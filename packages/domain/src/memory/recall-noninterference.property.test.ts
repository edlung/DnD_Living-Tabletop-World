import type { PerspectiveRequest } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, investigationWorld } from '../investigation/testing/world.ts';
import type { WorldState } from '../kernel/state.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import {
  entityKnowledge,
  knownEntities,
  listKnowledge,
  relatedKnowledge,
} from '../knowledge/queries.ts';
import { recallMemories } from './retrieval.ts';

/**
 * Randomized noninterference for perspective-scoped reads (Gate 02, G02-H01
 * and its adjacent paths). Two worlds share every fact a perspective may see
 * and differ only in hidden data: hidden locations and their ancestry (also
 * above a known location), hidden entities and placements, WORLD_TRUTH and DM
 * records, and another NPC's memories. Every memory, knowledge, and entity
 * query — including filters naming hidden IDs — must answer identically.
 */
const PERSPECTIVES: PerspectiveRequest[] = [
  { kind: 'PUBLIC' },
  { kind: 'PARTY' },
  { kind: 'CHARACTER', characterId: 'elowen-starwhisper' },
  { kind: 'NPC', npcId: 'mira-vale' },
  { kind: 'NPC', npcId: 'orin-stonebeard' },
];
const WORDS = ['room', 'vault', 'secret', 'caravan', 'dawn', 'cellar'];

/** The shared visible scaffold: a room every perspective knows, inside whatever `parentId` says. */
const scaffold = (parentId: string | null) => [
  {
    type: 'CreateEntity',
    entityId: 'known-room',
    kind: 'location',
    name: 'A remembered room',
    existsSince: null,
    location: { type: 'room', parentId },
  },
  {
    type: 'RecordMemory',
    memoryId: 'room-memory',
    scope: { kind: 'PUBLIC' },
    memoryKind: 'DECISION',
    summary: 'A remembered room.',
    occurredAt: 0,
    locationId: 'known-room',
  },
];

/** Random hidden-only changes: nothing here is visible to any perspective above. */
function hiddenChanges(seed: number): {
  parent: string | null;
  before: Record<string, unknown>[];
  after: Record<string, unknown>[];
} {
  const rng = mulberry32(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
  const hidden: string[] = [];
  const before: Record<string, unknown>[] = [];
  const count = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i += 1) {
    const id = `hidden-${String(seed)}-${String(i)}`;
    // Hidden places nest only among themselves (never inside a place anyone perceives or knows).
    before.push({
      type: 'CreateEntity',
      entityId: id,
      kind: 'location',
      name: `Secret vault ${String(i)}`,
      existsSince: null,
      location: { type: 'site', parentId: hidden.length > 0 && rng() < 0.6 ? pick(hidden) : null },
    });
    hidden.push(id);
  }
  const after: Record<string, unknown>[] = [];
  for (let i = 0; i < 3; i += 1) {
    const choice = rng();
    if (choice < 0.3) {
      after.push({
        type: 'CreateEntity',
        entityId: `hidden-item-${String(seed)}-${String(i)}`,
        kind: 'item',
        name: 'Secret cellar key',
        existsSince: null,
        placement: { locationId: pick(hidden), since: null },
      });
    } else if (choice < 0.6) {
      after.push({
        type: 'AddKnowledge',
        scope: { kind: pick(['WORLD_TRUTH', 'DM'] as const) },
        knowledgeType: 'SECRET',
        statement: 'The secret vault holds the room.',
        subjects: [pick(hidden), 'known-room'],
        knownSince: null,
      });
    } else {
      after.push({
        type: 'RecordMemory',
        scope: { kind: 'NPC', npcId: 'captain-thorne' },
        memoryKind: 'DECISION',
        summary: 'Thorne hid something in the secret vault room.',
        occurredAt: 0,
        participants: ['captain-thorne', 'known-room'],
        locationId: pick(hidden),
      });
    }
  }
  return { parent: rng() < 0.7 ? pick(hidden) : null, before, after };
}

async function world(seed: number): Promise<WorldState> {
  const changes = hiddenChanges(seed);
  const w = await investigationWorld();
  for (const command of [...changes.before, ...scaffold(changes.parent), ...changes.after]) {
    const result = await w.submit(command, DM);
    if (result.status === 'rejected')
      throw new Error(`${String(command['type'])}: ${result.code} ${result.message}`);
  }
  return w.state();
}

function observe(state: WorldState, request: PerspectiveRequest, ids: readonly string[]): unknown {
  const access = resolvePerspective(state, DM, request);
  if (!access.ok) throw new Error(access.reason);
  const p = access.perspective;
  const visible = listKnowledge(state, p);
  return {
    knowledge: visible,
    known: knownEntities(state, p),
    about: ids.map((id) => entityKnowledge(state, p, id)),
    related: (visible.ok ? visible.knowledge : []).map((k) =>
      relatedKnowledge(state, p, k.knowledgeId, 3),
    ),
    recall: [
      recallMemories(state, p, { limit: 50 }),
      ...ids.map((id) => recallMemories(state, p, { locationId: id, limit: 50 })),
      ...ids.map((id) => recallMemories(state, p, { entityId: id, limit: 50 })),
      ...WORDS.map((word) => recallMemories(state, p, { text: word, limit: 50 })),
    ],
  };
}

describe('noninterference of hidden data with perspective-scoped reads', () => {
  it.each([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
  ])('worlds %i and %i', async (a, b) => {
    const [first, second] = await Promise.all([world(a), world(b)]);
    const ids = [
      ...new Set([...first.entities.keys(), ...second.entities.keys(), 'missing-vault']),
    ].sort();
    for (const request of PERSPECTIVES) {
      expect(observe(second, request, ids), JSON.stringify(request)).toEqual(
        observe(first, request, ids),
      );
    }
  });
});
