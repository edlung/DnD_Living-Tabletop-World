import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { adoptedProofMatches } from '../assets/adoption-proof.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';

export function applyPreparedParty(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'PreparedPartyEstablished' }>,
): WorldState {
  const members = event.payload.characterIds;
  if (
    event.causation.commandType !== 'BootstrapCampaign' ||
    event.causation.actor.kind !== 'user' ||
    event.causation.actor.actorId !== state.campaign?.dmActorId ||
    state.bootstrap !== undefined ||
    state.preparedParty !== undefined ||
    new Set(members).size !== members.length ||
    members.some((id) => state.entities.get(id)?.kind !== 'character')
  )
    throw new CorruptHistoryError('invalid prepared party');
  return { ...state, preparedParty: new Set(members) };
}
export function applyCampaignBootstrapped(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'CampaignBootstrapped' }>,
): WorldState {
  if (
    event.causation.commandType !== 'BootstrapCampaign' ||
    state.bootstrap !== undefined ||
    state.preparedParty === undefined ||
    state.campaign?.dmActorId !== event.payload.source.ownerId ||
    event.causation.actor.kind !== 'user' ||
    event.causation.actor.actorId !== event.payload.source.ownerId ||
    state.roster.size !== 0 ||
    state.assets.requests.size !== 0 ||
    state.assets.jobs.size !== 0 ||
    (event.payload.visualMode === 'TEXT_ONLY') !== (state.assets.assets.size === 0) ||
    [...state.assets.assets.values()].some(
      (asset) =>
        !adoptedProofMatches(asset, event.payload.source, state.assets.assets) ||
        (asset.status !== 'CANONICAL' && asset.status !== 'APPROVED'),
    )
  )
    throw new CorruptHistoryError('invalid campaign bootstrap provenance');
  return { ...state, bootstrap: structuredClone(event.payload) };
}
