import { ENTITY_KINDS, ENTITY_STATUSES, LOCATION_TYPES } from '@ltw/contracts';

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
  if (roll < 0.75) return { type: 'EndScene', sceneId: pick([...state.scenes.keys(), 'none']) };
  if (roll < 0.84) return { type: 'AdvanceWorldTime', by: 1 + Math.floor(rng() * 7_200) };
  return { type: 'UndoCommand', targetCommandId: pick([...acceptedCommandIds, 'none']) };
}
