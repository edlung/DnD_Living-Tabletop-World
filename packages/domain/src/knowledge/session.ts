import type { SessionResponse } from '@ltw/contracts';

import type { Actor } from '../kernel/actor.ts';
import type { WorldState } from '../kernel/state.ts';
import { campaignRole, controlledCharacter, resolvePerspective } from './perspective.ts';
import { entityRef } from './projection.ts';
import { knownEntities } from './queries.ts';

/** Identity is independent of the selected view; no other player's actor ID is exposed. */
export function campaignSession(state: WorldState, actor: Actor): SessionResponse | null {
  const role = campaignRole(state, actor);
  if (!state.campaign || role === null || role === 'SYSTEM') return null;
  const ownId = role === 'PLAYER' ? controlledCharacter(state, actor.actorId) : null;
  const character = ownId === null ? null : entityRef(state, ownId);
  const perspectives =
    role === 'PLAYER' && character
      ? [
          { value: 'PLAYER', label: `Player · ${character.name}` },
          { value: `CHARACTER:${character.entityId}`, label: character.name },
        ]
      : [{ value: 'DM', label: 'Dungeon Master' }];
  perspectives.push({ value: 'PARTY', label: 'Party' }, { value: 'PUBLIC', label: 'Public' });
  if (role === 'DM') {
    const access = resolvePerspective(state, actor, { kind: 'DM' });
    if (!access.ok) return null;
    for (const entity of knownEntities(state, access.perspective)) {
      if (entity.kind === 'character') {
        perspectives.push({ value: `CHARACTER:${entity.entityId}`, label: entity.name });
      }
    }
  }
  return {
    actorId: actor.actorId,
    role,
    character,
    campaign: {
      campaignId: state.campaign.campaignId,
      name: state.campaign.name,
      language: state.campaign.language,
    },
    perspectives,
  };
}
