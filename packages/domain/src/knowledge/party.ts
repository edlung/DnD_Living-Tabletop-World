import type { WorldState } from '../kernel/state.ts';

/** Fictional party membership is separate from the actual actor-to-character control grant. */
export function partyMemberIds(state: WorldState): ReadonlySet<string> {
  return new Set([...(state.preparedParty ?? []), ...state.roster.keys()]);
}
export function isPartyMember(state: WorldState, characterId: string): boolean {
  return state.preparedParty?.has(characterId) === true || state.roster.has(characterId);
}
