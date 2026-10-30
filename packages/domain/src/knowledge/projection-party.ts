import { partyMemberIds } from './party.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from './perspective.ts';

/** Trusted preparation input for read projections only; it is never a roster or authority grant. */
export interface PartyProjectionContext {
  readonly memberIds: ReadonlySet<string>;
}

export function projectionPartyMemberIds(
  state: WorldState,
  perspective: ResolvedPerspective,
): ReadonlySet<string> {
  return perspective.partyMemberIds ?? partyMemberIds(state);
}

/** Copy and validate so caller mutations or non-character IDs cannot alter an already resolved view. */
export function preparedPartyIds(
  state: WorldState,
  context: PartyProjectionContext | undefined,
): ReadonlySet<string> | undefined {
  return context === undefined
    ? undefined
    : new Set([...context.memberIds].filter((id) => state.entities.get(id)?.kind === 'character'));
}
