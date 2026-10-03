import {
  ENTITY_KINDS,
  ENTITY_STATUSES,
  KNOWLEDGE_RELATION_TYPES,
  KNOWLEDGE_TYPES,
  LOCATION_TYPES,
} from '@ltw/contracts';

import type { WorldState } from '../state.ts';

/**
 * Seeded random command generator for replay/integrity property tests.
 * Produces a mix of valid and invalid commands (missing targets, temporal
 * conflicts, unsafe undos) so both acceptance and rejection paths run.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function randomCommand(
  rng: () => number,
  state: WorldState,
  acceptedCommandIds: readonly string[],
  step: number,
): Record<string, unknown> {
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(rng() * items.length)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  };
  const entities = [...state.entities.keys(), 'ghost'];
  const locations = [
    ...[...state.entities.values()].filter((e) => e.kind === 'location').map((e) => e.entityId),
    'ghost',
  ];
  const someTime = () =>
    pick([null, state.clock, state.clock - Math.floor(rng() * 100_000), state.clock + 1]);

  const roll = rng();
  if (roll < 0.25) {
    const kind = pick(ENTITY_KINDS);
    const wantsLocation = kind === 'location' ? rng() < 0.95 : rng() < 0.05;
    return {
      type: 'CreateEntity',
      entityId: rng() < 0.1 ? pick([...state.usedIds, 'ghost']) : `e${step}`,
      kind,
      name: `Entity ${step}`,
      existsSince: someTime(),
      ...(wantsLocation
        ? { location: { type: pick(LOCATION_TYPES), parentId: pick([null, ...locations]) } }
        : {}),
      ...(rng() < 0.4 ? { placement: { locationId: pick(locations), since: someTime() } } : {}),
    };
  }
  if (roll < 0.45) {
    return { type: 'PlaceEntity', entityId: pick(entities), locationId: pick(locations) };
  }
  if (roll < 0.53) {
    return { type: 'UpdateEntityProfile', entityId: pick(entities), name: `Name ${step % 7}` };
  }
  if (roll < 0.62) {
    return { type: 'ChangeEntityStatus', entityId: pick(entities), status: pick(ENTITY_STATUSES) };
  }
  if (roll < 0.69) {
    return { type: 'StartScene', sceneId: `s${step}`, title: 'Scene', locationId: pick(locations) };
  }
  if (roll < 0.71) return { type: 'EndScene', sceneId: pick([...state.scenes.keys(), 'none']) };
  if (roll < 0.72) return { type: 'StartSession', sessionId: `ss${step}`, title: 'Session' };
  if (roll < 0.73)
    return { type: 'EndSession', sessionId: pick([...state.sessions.keys(), 'none']) };
  if (roll < 0.76) return { type: 'AdvanceWorldTime', by: 1 + Math.floor(rng() * 7_200) };
  if (roll < 0.84) return randomKnowledge(rng, pick, state, entities, step);
  if (roll < 0.9) return randomMemory(rng, pick, state, entities, step);
  if (roll < 0.92) {
    return {
      type: 'AssignCharacter',
      characterId: pick(entities),
      playerActorId: pick(['player-a', 'player-b', 'dm-1']),
    };
  }
  return { type: 'UndoCommand', targetCommandId: pick([...acceptedCommandIds, 'none']) };
}

function randomKnowledge(
  rng: () => number,
  pick: <T>(items: readonly T[]) => T,
  state: WorldState,
  entities: readonly string[],
  step: number,
): Record<string, unknown> {
  // Mostly valid records (right holder kinds, existing references), sometimes invalid.
  const ofKind = (kind: string) =>
    [...state.entities.values()].filter((e) => e.kind === kind).map((e) => e.entityId);
  const valid = rng() < 0.75;
  const holders = { character: ofKind('character'), npc: ofKind('npc') };
  const scope = pick([
    { kind: 'WORLD_TRUTH' },
    { kind: 'DM' },
    { kind: 'PUBLIC' },
    { kind: 'PARTY' },
    {
      kind: 'CHARACTER',
      characterId: pick(valid && holders.character.length ? holders.character : entities),
    },
    { kind: 'NPC', npcId: pick(valid && holders.npc.length ? holders.npc : entities) },
  ]);
  const knowledgeType =
    scope.kind === 'WORLD_TRUTH' && valid
      ? pick(['FACT', 'SECRET'] as const)
      : pick(KNOWLEDGE_TYPES);
  const existing = [...state.entities.keys()];
  const subjects = [
    ...new Set(
      Array.from({ length: Math.floor(rng() * 3) }, () => pick(valid ? existing : entities)),
    ),
  ];
  const speakers = [...holders.npc, ...holders.character];
  const attributedTo =
    knowledgeType === 'TESTIMONY' || (knowledgeType === 'RUMOR' && rng() < 0.5) || !valid
      ? pick(valid && speakers.length ? speakers : entities)
      : undefined;
  const targets = valid ? [...state.knowledge.keys()] : [...state.knowledge.keys(), 'ghost-k'];
  return {
    type: 'AddKnowledge',
    knowledgeId: `k${step}`,
    scope,
    knowledgeType,
    statement: `Statement ${step}`,
    subjects,
    ...(attributedTo === undefined ? {} : { attributedTo }),
    relations:
      targets.length > 0 && rng() < 0.5
        ? [{ type: pick(KNOWLEDGE_RELATION_TYPES), knowledgeId: pick(targets) }]
        : [],
    knownSince: valid
      ? pick([null, state.clock, state.clock - 3_600])
      : pick([null, state.clock + 1]),
  };
}

function randomMemory(
  rng: () => number,
  pick: <T>(items: readonly T[]) => T,
  state: WorldState,
  entities: readonly string[],
  step: number,
): Record<string, unknown> {
  // Mostly plausible memories (holder at its current place, now), sometimes impossible.
  const holders = [...state.entities.values()].filter(
    (e) => (e.kind === 'npc' || e.kind === 'character') && e.placement !== null,
  );
  const holder = holders.length > 0 && rng() < 0.8 ? pick(holders) : undefined;
  const scope = holder
    ? holder.kind === 'npc'
      ? { kind: 'NPC', npcId: holder.entityId }
      : { kind: 'CHARACTER', characterId: holder.entityId }
    : pick([{ kind: 'PUBLIC' }, { kind: 'PARTY' }, { kind: 'NPC', npcId: pick(entities) }]);
  const memoryKind = pick([
    'OBSERVATION',
    'CONVERSATION',
    'DECISION',
    'DISCOVERY',
    'CONSEQUENCE',
  ] as const);
  const memories = [...state.memories.keys()];
  return {
    type: 'RecordMemory',
    memoryId: `m${step}`,
    scope,
    memoryKind,
    summary: `Memory ${step}`,
    occurredAt: pick([state.clock, state.clock, state.clock - 600, state.clock + 60]),
    ...(holder?.placement ? { locationId: holder.placement.locationId } : {}),
    participants: holder && rng() < 0.9 ? [holder.entityId] : [],
    ...(memoryKind === 'CONSEQUENCE' && memories.length > 0 && rng() < 0.6
      ? { causedBy: [pick(memories)] }
      : {}),
    ...(state.sessions.size > 0 && rng() < 0.3
      ? { sessionId: pick([...state.sessions.keys()]) }
      : {}),
  };
}
