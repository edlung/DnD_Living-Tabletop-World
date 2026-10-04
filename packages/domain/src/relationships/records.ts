import { DEFAULT_ATTITUDE, type Attitude } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';

/**
 * Relationships (docs/adr/0019-continuity-engine.md §3): an NPC's attitude
 * toward the party. DM data; no player view, outcome, or context shows it.
 */
export const attitudeOf = (state: WorldState, npcId: string): Attitude =>
  state.relationships.get(npcId) ?? DEFAULT_ATTITUDE;

/** Attitudes under which an NPC would not willingly share with the party. */
export const RESERVED_ATTITUDES: ReadonlySet<Attitude> = new Set(['HOSTILE', 'WARY']);
